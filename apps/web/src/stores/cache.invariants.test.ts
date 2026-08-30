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

const mockFetchMembers = jest.fn()
jest.mock('./member.store', () => ({
  useMemberStore: {
    getState: () => ({ fetchMembers: mockFetchMembers })
  }
}))

const mockFetchEmojis = jest.fn()
jest.mock('./emoji.store', () => ({
  useEmojiStore: {
    getState: () => ({ fetch: mockFetchEmojis })
  }
}))

import { useChannelPermissionsStore } from './channel-permissions.store'
import { useChannelStore } from './channel.store'
import { useDmStore } from './dm.store'
import { useMessageStore } from './message.store'
import { useNavHistoryStore } from './navHistory.store'
import { useNavigationStore } from './navigation.store'
import { useServerStore } from './server.store'

/**
 * Blunt guards over decisions the design leans on. Each one exists because
 * reverting it would not break an obvious test — it would quietly make the
 * cache stop working, or stop being correct.
 */

let api: FakeApi

beforeEach(() => {
  resetMsgSeq()
  clearCache(false)
  clearStructureCache(false)
  localStorage.clear()
  mockSocket.emit.mockClear()
  mockFetchMembers.mockReset()
  mockFetchEmojis.mockReset()

  api = new FakeApi({
    servers: [
      {
        id: 'srv-a',
        channels: [
          { id: 'a-general', name: 'general', position: 0, messages: seedMessages('a-general', 3) },
          { id: 'a-other', name: 'other', position: 1, messages: seedMessages('a-other', 2) }
        ]
      },
      { id: 'srv-b', channels: [{ id: 'b-general', messages: seedMessages('b-general', 1) }] }
    ],
    dms: [{ id: 'conv-1', messages: seedMessages('conv-1', 2) }]
  })
  mockApiHolder.current = api

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
})

const goToChannel = (serverId: string, channelId?: string) =>
  useNavigationStore.getState().navigateToChannel({ serverId, channelId })

describe('hydration sets the loaded id alongside the messages', () => {
  // useMessageScroll compares loadedForChannelId against the channel it is
  // rendering; a mismatch makes it call clearMessages, which would look
  // exactly like the cache never working at all.
  it('for channels', async () => {
    await goToChannel('srv-a', 'a-general')
    await goToChannel('srv-a', 'a-other')

    const hydrated = useMessageStore.getState().hydrateFromCache('a-general')

    expect(hydrated).toBe(true)
    expect(useMessageStore.getState().loadedForChannelId).toBe('a-general')
    expect(useMessageStore.getState().messages.length).toBeGreaterThan(0)
  })

  it('for DMs', async () => {
    await useNavigationStore.getState().navigateToDm({ conversationId: 'conv-1' })
    useDmStore.setState({ messages: [], loadedForConvId: null })

    const hydrated = useDmStore.getState().hydrateFromCache('conv-1')

    expect(hydrated).toBe(true)
    expect(useDmStore.getState().loadedForConvId).toBe('conv-1')
    expect(useDmStore.getState().messages.length).toBeGreaterThan(0)
  })

  it('reports a miss rather than half-applying', () => {
    const hydrated = useMessageStore.getState().hydrateFromCache('never-visited')

    expect(hydrated).toBe(false)
    expect(useMessageStore.getState().loadedForChannelId).toBeNull()
    expect(useMessageStore.getState().messages).toEqual([])
  })
})

describe('navigation never leaves a socket room', () => {
  // The gateway subscribes every visible channel on connect. Leaving is what
  // used to make a visited-then-left channel go silent, which both freezes its
  // unread badge and lets its cached copy drift.
  it('when switching channels within a server', async () => {
    await goToChannel('srv-a', 'a-general')
    await goToChannel('srv-a', 'a-other')

    expect(mockSocket.emit.mock.calls.map(([event]) => event)).not.toContain('channel:leave')
  })

  it('when switching servers', async () => {
    await goToChannel('srv-a', 'a-general')
    await goToChannel('srv-b')

    expect(mockSocket.emit.mock.calls.map(([event]) => event)).not.toContain('channel:leave')
  })

  it('when leaving for a DM', async () => {
    await goToChannel('srv-a', 'a-general')
    await useNavigationStore.getState().navigateToDm({ conversationId: 'conv-1' })

    expect(mockSocket.emit.mock.calls.map(([event]) => event)).not.toContain('channel:leave')
  })
})

describe('navigation does not wait for the side panels', () => {
  it('resolves without awaiting members or emojis', async () => {
    let membersResolved = false
    let emojisResolved = false
    mockFetchMembers.mockImplementation(
      () =>
        new Promise<void>((resolve) =>
          setTimeout(() => {
            membersResolved = true
            resolve()
          }, 50)
        )
    )
    mockFetchEmojis.mockImplementation(
      () =>
        new Promise<void>((resolve) =>
          setTimeout(() => {
            emojisResolved = true
            resolve()
          }, 50)
        )
    )

    const path = await goToChannel('srv-a', 'a-general')

    expect(path).toBe('/channels/srv-a/a-general')
    expect(mockFetchMembers).toHaveBeenCalledWith('srv-a')
    expect(mockFetchEmojis).toHaveBeenCalledWith('srv-a')
    expect(membersResolved).toBe(false)
    expect(emojisResolved).toBe(false)
  })

  it('survives a members fetch that rejects', async () => {
    mockFetchMembers.mockRejectedValue(new Error('members are down'))
    mockFetchEmojis.mockResolvedValue(undefined)

    await expect(goToChannel('srv-a', 'a-general')).resolves.toBe('/channels/srv-a/a-general')
  })
})

describe('a warm server switch does not block on structure', () => {
  it('resolves before the channel refresh completes', async () => {
    await goToChannel('srv-a', 'a-general')
    await goToChannel('srv-b')

    api.defer('/api/servers/srv-a/channels')
    const path = await goToChannel('srv-a')

    expect(path).toBe('/channels/srv-a/a-general')
    expect(useChannelStore.getState().channels.map((c) => c.id)).toEqual(['a-general', 'a-other'])
    api.release('/api/servers/srv-a/channels')
  })
})
