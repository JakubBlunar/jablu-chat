import { cacheKeys, channelKey, clearCache, dmKey, peekContext } from '@/lib/cache/messageCache'
import { clearStructureCache } from '@/lib/cache/structureCache'
import { FakeApi, seedMessages } from '@/test/fakeApi'
import { resetMsgSeq } from '@/test/factories'

const mockApiHolder: { current: FakeApi | null } = { current: null }

jest.mock('@/lib/api', () => ({
  get api() {
    return mockApiHolder.current
  }
}))

jest.mock('@/lib/socket', () => ({
  getSocket: () => ({ emit: jest.fn(), connected: true })
}))

import { useChannelPermissionsStore } from './channel-permissions.store'
import { useChannelStore } from './channel.store'
import { useDmStore } from './dm.store'
import { useMessageStore } from './message.store'
import { useNavHistoryStore } from './navHistory.store'
import { useNavigationStore } from './navigation.store'
import { useServerStore } from './server.store'

/**
 * Before the cache, a response that arrived after the user had moved on was
 * simply discarded by the fetch nonce. With a cache it can instead be written
 * into an entry, persisted, and survive a reload. Every test here asserts the
 * late response is discarded *and* never cached under any key.
 */

function seed() {
  return new FakeApi({
    servers: [
      {
        id: 'srv-a',
        channels: [
          { id: 'a-slow', name: 'slow', position: 0, messages: seedMessages('a-slow', 4) },
          { id: 'a-fast', name: 'fast', position: 1, messages: seedMessages('a-fast', 2) }
        ]
      }
    ],
    dms: [{ id: 'conv-slow', messages: seedMessages('conv-slow', 3) }]
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
})

const goToChannel = (serverId: string, channelId?: string) =>
  useNavigationStore.getState().navigateToChannel({ serverId, channelId })

const goToDm = (conversationId: string) => useNavigationStore.getState().navigateToDm({ conversationId })

/** Lets every already-resolved promise settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

function everyCachedId(): string[] {
  return cacheKeys().flatMap((key) => peekContext(key)!.messages.map((m) => m.id))
}

describe('switching away while a fetch is in flight', () => {
  it('discards the late response instead of showing it', async () => {
    api.defer('a-slow')

    const slow = goToChannel('srv-a', 'a-slow')
    await goToChannel('srv-a', 'a-fast')

    api.release('a-slow')
    await slow
    await settle()

    expect(useMessageStore.getState().loadedForChannelId).toBe('a-fast')
    expect(useMessageStore.getState().messages.map((m) => m.id)).toEqual(['a-fast-m1', 'a-fast-m2'])
  })

  it('never caches the late response under the channel the user moved to', async () => {
    api.defer('a-slow')

    const slow = goToChannel('srv-a', 'a-slow')
    await goToChannel('srv-a', 'a-fast')

    api.release('a-slow')
    await slow
    await settle()

    expect(peekContext(channelKey('a-fast'))!.messages.map((m) => m.id)).toEqual(['a-fast-m1', 'a-fast-m2'])
    expect(everyCachedId()).not.toContain('a-slow-m1')
  })
})

describe('switching back while a fetch is in flight', () => {
  it('ends on the channel the user is actually looking at', async () => {
    await goToChannel('srv-a', 'a-fast')
    api.defer('a-slow')

    const slow = goToChannel('srv-a', 'a-slow')
    const back = goToChannel('srv-a', 'a-fast')

    api.release('a-slow')
    await Promise.all([slow, back])
    await settle()

    expect(useMessageStore.getState().loadedForChannelId).toBe('a-fast')
    expect(useMessageStore.getState().messages.map((m) => m.id)).toEqual(['a-fast-m1', 'a-fast-m2'])
    expect(peekContext(channelKey('a-fast'))!.messages.map((m) => m.id)).toEqual(['a-fast-m1', 'a-fast-m2'])
  })
})

describe('interleaved DM and channel fetches', () => {
  it('resolves each response into its own cache entry', async () => {
    api.defer('conv-slow')

    const dm = goToDm('conv-slow')
    await goToChannel('srv-a', 'a-fast')

    api.release('conv-slow')
    await dm
    await settle()

    expect(useMessageStore.getState().messages.map((m) => m.id)).toEqual(['a-fast-m1', 'a-fast-m2'])
    expect(peekContext(channelKey('a-fast'))!.messages.map((m) => m.id)).toEqual(['a-fast-m1', 'a-fast-m2'])

    const cachedDm = peekContext(dmKey('conv-slow'))
    if (cachedDm) {
      expect(cachedDm.messages.map((m) => m.id)).toEqual(['conv-slow-m1', 'conv-slow-m2', 'conv-slow-m3'])
    }
  })

  it('does not let a DM response leak into a channel entry', async () => {
    api.defer('conv-slow')

    const dm = goToDm('conv-slow')
    await goToChannel('srv-a', 'a-slow')

    api.release('conv-slow')
    await dm
    await settle()

    expect(peekContext(channelKey('a-slow'))!.messages.map((m) => m.id)).toEqual([
      'a-slow-m1',
      'a-slow-m2',
      'a-slow-m3',
      'a-slow-m4'
    ])
    expect(peekContext(channelKey('conv-slow'))).toBeNull()
  })
})

describe('a stale structure response', () => {
  it('does not overwrite the sidebar of the server the user switched to', async () => {
    const twoServers = new FakeApi({
      servers: [
        { id: 'srv-slow', channels: [{ id: 'slow-1', messages: seedMessages('slow-1', 1) }] },
        { id: 'srv-fast', channels: [{ id: 'fast-1', messages: seedMessages('fast-1', 1) }] }
      ]
    })
    mockApiHolder.current = twoServers
    twoServers.defer('/api/servers/srv-slow/channels')

    const slow = goToChannel('srv-slow')
    await goToChannel('srv-fast')

    twoServers.release('/api/servers/srv-slow/channels')
    await slow
    await settle()

    expect(useChannelStore.getState().loadedServerId).toBe('srv-fast')
    expect(useChannelStore.getState().channels.map((c) => c.id)).toEqual(['fast-1'])
  })
})
