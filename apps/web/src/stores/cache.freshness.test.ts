import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { channelKey, clearCache, peekContext } from '@/lib/cache/messageCache'
import { clearStructureCache } from '@/lib/cache/structureCache'
import { FakeApi, seedMessages } from '@/test/fakeApi'
import { makeMessage, resetMsgSeq } from '@/test/factories'

const mockApiHolder: { current: FakeApi | null } = { current: null }

jest.mock('@/lib/api', () => ({
  get api() {
    return mockApiHolder.current
  }
}))

jest.mock('@/lib/socket', () => ({
  getSocket: () => ({ emit: jest.fn(), connected: true })
}))

jest.mock('@/lib/notifications', () => ({
  showNotification: jest.fn()
}))

import { initCacheDb, resetDbForTests, writeMessages } from '@/lib/cache/db'
import { createChannelHandlers } from '@/hooks/socket/channelHandlers'
import { useAuthStore } from './auth.store'
import { useChannelPermissionsStore } from './channel-permissions.store'
import { useChannelStore } from './channel.store'
import { useDmStore } from './dm.store'
import { useMessageStore } from './message.store'
import { useNavHistoryStore } from './navHistory.store'
import { useNavigationStore } from './navigation.store'
import { useServerStore } from './server.store'

const handlers = createChannelHandlers((fn) => fn())

function seed() {
  return new FakeApi({
    servers: [
      {
        id: 'srv-a',
        channels: [
          { id: 'a-general', name: 'general', position: 0, messages: seedMessages('a-general', 3) },
          { id: 'a-other', name: 'other', position: 1, messages: seedMessages('a-other', 2) }
        ]
      }
    ]
  })
}

function resetAll() {
  resetMsgSeq()
  clearCache(false)
  clearStructureCache(false)
  localStorage.clear()

  useAuthStore.setState({ user: { id: 'me' } as never })
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
  useDmStore.setState({ messages: [], loadedForConvId: null, currentConversationId: null, conversations: [] })
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
  globalThis.indexedDB = new IDBFactory()
  resetDbForTests()
  resetAll()
  api = seed()
  mockApiHolder.current = api
})

const goToChannel = (serverId: string, channelId?: string) =>
  useNavigationStore.getState().navigateToChannel({ serverId, channelId })

const visibleIds = () => useMessageStore.getState().messages.map((m) => m.id)

/** Visit both channels so `a-general` is cached but not the one being viewed. */
async function cacheGeneralThenLeave() {
  await goToChannel('srv-a', 'a-general')
  await goToChannel('srv-a', 'a-other')
}

describe('socket events reach a cached channel the user is not looking at', () => {
  it('shows a message that arrived while away', async () => {
    await cacheGeneralThenLeave()

    handlers.onMessageNew(
      makeMessage({ id: 'arrived-while-away', channelId: 'a-general', authorId: 'someone-else' })
    )

    await goToChannel('srv-a', 'a-general')

    expect(visibleIds()).toContain('arrived-while-away')
    expect(api.countFor('/api/channels/a-general/messages')).toBe(1)
  })

  it('shows an edit that happened while away', async () => {
    await cacheGeneralThenLeave()

    handlers.onMessageEdit(
      makeMessage({ id: 'a-general-m2', channelId: 'a-general', content: 'edited while away' })
    )

    await goToChannel('srv-a', 'a-general')

    const edited = useMessageStore.getState().messages.find((m) => m.id === 'a-general-m2')
    expect(edited?.content).toBe('edited while away')
  })

  it('drops a message deleted while away', async () => {
    await cacheGeneralThenLeave()

    handlers.onMessageDelete({ messageId: 'a-general-m2', channelId: 'a-general' })

    await goToChannel('srv-a', 'a-general')

    expect(visibleIds()).toEqual(['a-general-m1', 'a-general-m3'])
  })

  it('reflects a reaction added while away', async () => {
    await cacheGeneralThenLeave()

    handlers.onReactionAdd({ messageId: 'a-general-m1', emoji: '👍', userId: 'someone-else', isCustom: false })

    await goToChannel('srv-a', 'a-general')

    const target = useMessageStore.getState().messages.find((m) => m.id === 'a-general-m1')
    expect(target?.reactions).toEqual([
      { emoji: '👍', count: 1, userIds: ['someone-else'], isCustom: false }
    ])
  })

  it('leaves other cached channels untouched', async () => {
    await cacheGeneralThenLeave()

    handlers.onMessageNew(makeMessage({ id: 'only-general', channelId: 'a-general', authorId: 'x' }))

    expect(peekContext(channelKey('a-general'))!.messages.map((m) => m.id)).toContain('only-general')
    expect(peekContext(channelKey('a-other'))!.messages.map((m) => m.id)).toEqual([
      'a-other-m1',
      'a-other-m2'
    ])
  })
})

describe('a context hydrated from disk', () => {
  async function seedDisk(messages: Array<{ id: string; content: string }>) {
    await initCacheDb('user-1')
    await writeMessages({
      key: channelKey('a-general'),
      messages: messages.map((m) =>
        makeMessage({ id: m.id, channelId: 'a-general', content: m.content })
      ),
      hasMore: false,
      hasNewer: false,
      updatedAt: Date.now()
    })
  }

  it('renders from disk and then corrects itself against the newest page', async () => {
    await seedDisk([
      { id: 'a-general-m1', content: 'stale copy' },
      { id: 'deleted-while-closed', content: 'gone' }
    ])
    // Hold the revalidation open so the first-paint state is observable.
    api.defer('a-general/messages')

    await goToChannel('srv-a', 'a-general')

    expect(visibleIds()).toEqual(['a-general-m1', 'deleted-while-closed'])
    expect(useMessageStore.getState().isLoading).toBe(false)

    api.release('a-general/messages')
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(visibleIds()).toEqual(['a-general-m1', 'a-general-m2', 'a-general-m3'])
    expect(useMessageStore.getState().messages[0].content).toBe('a-general message 1')
    expect(api.countFor('/api/channels/a-general/messages')).toBe(1)
  })

  it('keeps a message that arrived over the socket during revalidation', async () => {
    await seedDisk([{ id: 'a-general-m1', content: 'stale copy' }])
    api.defer('a-general/messages')

    await goToChannel('srv-a', 'a-general')

    useMessageStore.getState().addMessage(
      makeMessage({
        id: 'arrived-mid-flight',
        channelId: 'a-general',
        createdAt: new Date(Date.now() + 60_000).toISOString()
      })
    )

    api.release('a-general/messages')
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(visibleIds()).toEqual([
      'a-general-m1',
      'a-general-m2',
      'a-general-m3',
      'arrived-mid-flight'
    ])
  })

  it('does not revalidate a context that was cached in memory', async () => {
    await goToChannel('srv-a', 'a-general')
    await goToChannel('srv-a', 'a-other')
    api.reset()

    await goToChannel('srv-a', 'a-general')
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(api.countFor('/api/channels/a-general/messages')).toBe(0)
  })
})

describe('access revoked while the app was closed', () => {
  it('evicts the cached channel and refetches the sidebar on a 403', async () => {
    await initCacheDb('user-1')
    await writeMessages({
      key: channelKey('a-general'),
      messages: [makeMessage({ id: 'a-general-m1', channelId: 'a-general' })],
      hasMore: false,
      hasNewer: false,
      updatedAt: Date.now()
    })

    await goToChannel('srv-a', 'a-general')
    api.reset()
    api.failWith('/api/channels/a-general/messages', 403)

    await useMessageStore.getState().revalidate('a-general')

    expect(peekContext(channelKey('a-general'))).toBeNull()
    expect(api.countFor('/api/servers/srv-a/channels')).toBe(1)
    expect(api.countFor('/api/servers/srv-a/channel-permissions')).toBe(1)
  })
})
