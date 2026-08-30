import { clearCache } from '@/lib/cache/messageCache'
import { clearStructureCache } from '@/lib/cache/structureCache'
import { FakeApi, seedMessages } from '@/test/fakeApi'
import { resetMsgSeq } from '@/test/factories'

const mockApiHolder: { current: FakeApi | null } = { current: null }

jest.mock('@/lib/api', () => ({
  get api() {
    return mockApiHolder.current
  }
}))

const mockSocket = { emit: jest.fn(), connected: true }
jest.mock('@/lib/socket', () => ({
  getSocket: () => mockSocket
}))

import { useChannelPermissionsStore } from './channel-permissions.store'
import { useChannelStore } from './channel.store'
import { useDmStore } from './dm.store'
import { useMessageStore } from './message.store'
import { useNavHistoryStore } from './navHistory.store'
import { useNavigationStore } from './navigation.store'
import { useServerStore } from './server.store'

/**
 * These drive the real stores end to end. Each hop asserts what is on screen
 * and then what was requested: content alone passes with a dead cache, and
 * request counts alone pass with a cache serving the wrong channel.
 */

const MESSAGES_A_GENERAL = '/api/channels/a-general/messages'
const MESSAGES_A_RANDOM = '/api/channels/a-random/messages'
const MESSAGES_B_RANDOM = '/api/channels/b-random/messages'
const CHANNELS_A = '/api/servers/srv-a/channels'
const PERMISSIONS_A = '/api/servers/srv-a/channel-permissions'

function seed() {
  return new FakeApi({
    servers: [
      {
        id: 'srv-a',
        channels: [
          { id: 'a-general', name: 'general', position: 0, messages: seedMessages('a-general', 5) },
          { id: 'a-random', name: 'random', position: 1, messages: seedMessages('a-random', 3) },
          { id: 'a-voice', name: 'voice', type: 'voice', position: 2, messages: [] }
        ]
      },
      {
        id: 'srv-b',
        channels: [{ id: 'b-random', name: 'random', position: 0, messages: seedMessages('b-random', 4) }]
      },
      {
        id: 'srv-c',
        channels: [{ id: 'c-general', name: 'general', position: 0, messages: seedMessages('c-general', 2) }]
      }
    ],
    dms: [{ id: 'conv-1', messages: seedMessages('conv-1', 3) }]
  })
}

function resetAll() {
  resetMsgSeq()
  clearCache(false)
  clearStructureCache(false)
  localStorage.clear()

  useNavigationStore.setState({ isNavigating: false, navigatingToServerId: null, activeNavId: 0 })
  useServerStore.setState({ servers: [], currentServerId: null, viewMode: 'server', isLoading: false })
  useChannelStore.setState({
    channels: [],
    categories: [],
    currentChannelId: null,
    isLoading: false,
    loadedServerId: null
  })
  useChannelPermissionsStore.setState({ permissionsMap: {}, loadedServerId: null })
  useMessageStore.setState({
    messages: [],
    isLoading: false,
    hasMore: false,
    hasNewer: false,
    loadedForChannelId: null,
    typingUsers: new Map()
  })
  useDmStore.setState({
    messages: [],
    isLoading: false,
    hasMore: false,
    hasNewer: false,
    loadedForConvId: null,
    currentConversationId: null,
    conversations: []
  })
  useNavHistoryStore.setState({
    userId: 'user-1',
    lastChannelByServer: {},
    serverOrder: [],
    lastDmScreen: null,
    lastLocation: null
  })
}

let api: FakeApi

beforeEach(() => {
  resetAll()
  api = seed()
  mockApiHolder.current = api
  mockSocket.emit.mockClear()
})

const goToChannel = (serverId: string, channelId?: string) =>
  useNavigationStore.getState().navigateToChannel({ serverId, channelId })

const goToDm = (conversationId: string) => useNavigationStore.getState().navigateToDm({ conversationId })

const visibleIds = () => useMessageStore.getState().messages.map((m) => m.id)

describe('back and forth within one server', () => {
  it('serves the second visit from cache with no request', async () => {
    await goToChannel('srv-a', 'a-general')
    expect(visibleIds()).toEqual(['a-general-m1', 'a-general-m2', 'a-general-m3', 'a-general-m4', 'a-general-m5'])
    expect(api.countFor(MESSAGES_A_GENERAL)).toBe(1)

    await goToChannel('srv-a', 'a-random')
    expect(visibleIds()).toEqual(['a-random-m1', 'a-random-m2', 'a-random-m3'])

    await goToChannel('srv-a', 'a-general')
    expect(visibleIds()).toEqual(['a-general-m1', 'a-general-m2', 'a-general-m3', 'a-general-m4', 'a-general-m5'])
    expect(api.countFor(MESSAGES_A_GENERAL)).toBe(1)
    expect(api.countFor(MESSAGES_A_RANDOM)).toBe(1)
  })

  it('leaves loadedForChannelId consistent with the messages it served', async () => {
    await goToChannel('srv-a', 'a-general')
    await goToChannel('srv-a', 'a-random')
    await goToChannel('srv-a', 'a-general')

    expect(useMessageStore.getState().loadedForChannelId).toBe('a-general')
    expect(useMessageStore.getState().isLoading).toBe(false)
  })

  it('still fetches a channel that was never visited', async () => {
    await goToChannel('srv-a', 'a-general')
    api.reset()

    await goToChannel('srv-a', 'a-random')

    expect(api.countFor(MESSAGES_A_RANDOM)).toBe(1)
    expect(visibleIds()).toEqual(['a-random-m1', 'a-random-m2', 'a-random-m3'])
  })
})

describe('across servers', () => {
  it('returns to the remembered channel rather than the first text channel', async () => {
    await goToChannel('srv-a', 'a-random')
    await goToChannel('srv-b')

    const path = await goToChannel('srv-a')

    expect(path).toBe('/channels/srv-a/a-random')
    expect(visibleIds()).toEqual(['a-random-m1', 'a-random-m2', 'a-random-m3'])
  })

  it('renders the sidebar on return without refetching channels or permissions', async () => {
    await goToChannel('srv-a', 'a-general')
    await goToChannel('srv-b')
    api.reset()

    await goToChannel('srv-a')

    expect(useChannelStore.getState().channels.map((c) => c.id)).toEqual(['a-general', 'a-random', 'a-voice'])
    expect(useChannelStore.getState().isLoading).toBe(false)
    // The refresh is fired but not awaited, so the route resolved before it.
    expect(api.callsFor(CHANNELS_A)).toHaveLength(1)
    expect(api.callsFor(PERMISSIONS_A)).toHaveLength(1)
    expect(api.countFor(MESSAGES_A_GENERAL)).toBe(0)
  })

  it('falls back to the first text channel when nothing is remembered', async () => {
    const path = await goToChannel('srv-a')
    expect(path).toBe('/channels/srv-a/a-general')
  })

  it('does not remember a voice channel as the landing spot', async () => {
    await goToChannel('srv-a', 'a-general')
    await goToChannel('srv-a', 'a-voice')
    await goToChannel('srv-b')

    const path = await goToChannel('srv-a')

    expect(path).toBe('/channels/srv-a/a-general')
  })

  it('does not point a cold boot at a voice channel either', async () => {
    await goToChannel('srv-a', 'a-general')
    await goToChannel('srv-a', 'a-voice')

    expect(useNavHistoryStore.getState().lastLocation).toEqual({
      kind: 'server',
      serverId: 'srv-a',
      channelId: 'a-general'
    })
  })
})

describe('channel to DM and back', () => {
  it('keeps the two contexts separate', async () => {
    await goToChannel('srv-a', 'a-general')
    await goToDm('conv-1')

    expect(useDmStore.getState().messages.map((m) => m.id)).toEqual(['conv-1-m1', 'conv-1-m2', 'conv-1-m3'])
    expect(useDmStore.getState().loadedForConvId).toBe('conv-1')

    await goToChannel('srv-a', 'a-general')

    expect(visibleIds()).toEqual(['a-general-m1', 'a-general-m2', 'a-general-m3', 'a-general-m4', 'a-general-m5'])
    expect(api.countFor(MESSAGES_A_GENERAL)).toBe(1)
  })

  it('serves a revisited DM from cache', async () => {
    await goToDm('conv-1')
    await goToChannel('srv-a', 'a-general')
    api.reset()

    await goToDm('conv-1')

    expect(useDmStore.getState().messages.map((m) => m.id)).toEqual(['conv-1-m1', 'conv-1-m2', 'conv-1-m3'])
    expect(api.countFor('/api/dm/conv-1/messages')).toBe(0)
  })

  it('a channel id and a conversation id that match do not collide', async () => {
    const collidingApi = new FakeApi({
      servers: [{ id: 'srv-a', channels: [{ id: 'same-id', messages: seedMessages('chan', 2) }] }],
      dms: [{ id: 'same-id', messages: seedMessages('conv', 4) }]
    })
    mockApiHolder.current = collidingApi

    await goToChannel('srv-a', 'same-id')
    await goToDm('same-id')
    await goToChannel('srv-a', 'same-id')

    expect(visibleIds()).toEqual(['chan-m1', 'chan-m2'])
    expect(useDmStore.getState().messages.map((m) => m.id)).toEqual([
      'conv-m1',
      'conv-m2',
      'conv-m3',
      'conv-m4'
    ])
  })
})

describe('rapid switching', () => {
  it('leaves only the last destination active with every context intact', async () => {
    const a = goToChannel('srv-a', 'a-general')
    const b = goToChannel('srv-b', 'b-random')
    const c = goToChannel('srv-c', 'c-general')

    const [, , pathC] = await Promise.all([a, b, c])

    expect(pathC).toBe('/channels/srv-c/c-general')
    expect(useMessageStore.getState().loadedForChannelId).toBe('c-general')
    expect(visibleIds()).toEqual(['c-general-m1', 'c-general-m2'])

    await goToChannel('srv-b', 'b-random')
    expect(visibleIds()).toEqual(['b-random-m1', 'b-random-m2', 'b-random-m3', 'b-random-m4'])
  })

  it('never leaves a superseded navigation as the visible state', async () => {
    void goToChannel('srv-a', 'a-general')
    const path = await goToChannel('srv-b', 'b-random')

    expect(path).toBe('/channels/srv-b/b-random')
    expect(useMessageStore.getState().loadedForChannelId).toBe('b-random')
    expect(api.countFor(MESSAGES_B_RANDOM)).toBe(1)
  })
})
