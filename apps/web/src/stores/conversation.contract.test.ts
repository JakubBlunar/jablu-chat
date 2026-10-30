import { api } from '@/lib/api'
import { openConversation, bindConversationRouter } from '@/lib/conversationNavigation'
import { conversationPath, parseConversationPath, type ConversationRequest } from '@/lib/conversationTarget'
import { useNavigationStore } from './navigation.store'
import { useChannelStore } from './channel.store'
import { useChannelPermissionsStore } from './channel-permissions.store'
import { useServerStore } from './server.store'
import { useMessageStore } from './message.store'
import { useDmStore } from './dm.store'
import { useThreadStore } from './thread.store'
import { useForumStore } from './forum.store'
import { useForumReplyStore } from './forumReply.store'
import { useReadStateStore } from './readState.store'
import { useLayoutStore } from './layout.store'
import { clearCache } from '@/lib/cache/messageCache'
import { clearStructureCache } from '@/lib/cache/structureCache'
import { makeChannel, makeMessage } from '@/test/factories'

jest.mock('@/lib/socket', () => ({ getSocket: () => ({ emit: jest.fn() }) }))
jest.mock('@/lib/cache/hydrate', () => ({ hydrateContextFromDisk: jest.fn().mockResolvedValue(false) }))
jest.mock('@/lib/api', () => ({
  api: { get: jest.fn(), getDmMessages: jest.fn(), getDmMessagesAround: jest.fn(), getThreadMessages: jest.fn() }
}))
const navigate = jest.fn()
const request: ConversationRequest = { target: { kind: 'channel', serverId: 's1', channelId: 'ch1' }, source: 'inbox' }
let key: string
let sequence = 0
function enter(path: string, state?: { conversationRequestId?: number; conversationConsumedId?: number }) {
  const target = parseConversationPath(path)!
  const entryKey = `entry-${++sequence}`
  key = entryKey
  return useNavigationStore.getState().enterRoute(target, {
    key: entryKey,
    requestId: state?.conversationRequestId,
    consumedId: state?.conversationConsumedId,
    isCurrent: () => key === entryKey
  })
}
function commit() {
  const [path, options] = navigate.mock.calls.at(-1)!
  return enter(path, options.state)
}
beforeEach(() => {
  jest.clearAllMocks()
  useNavigationStore.getState().reset()
  bindConversationRouter(navigate)
  clearCache(false)
  clearStructureCache(false)
  useReadStateStore.getState().reset()
  useChannelStore.setState({
    currentChannelId: 'old',
    loadedServerId: 's1',
    channels: [makeChannel('ch1', 's1'), makeChannel('ch2', 's1'), makeChannel('forum', 's1', { type: 'forum' })]
  })
  useChannelPermissionsStore.setState({ requestedServerId: 's1', loadedServerId: 's1' })
  useServerStore.setState({ currentServerId: 's1', viewMode: 'server' })
  useMessageStore.getState().clearMessages()
  useDmStore.getState().clearMessages()
  useThreadStore.getState().closeThread()
  useForumReplyStore.getState().clearMessages()
  useForumStore.getState().reset()
  jest.mocked(api.get).mockResolvedValue({ messages: [], hasMore: false })
  jest.mocked(api.getDmMessages).mockResolvedValue({ messages: [], hasMore: false })
  jest.mocked(api.getThreadMessages).mockResolvedValue({ messages: [], hasMore: false })
})
afterEach(() => {
  useNavigationStore.getState().reset()
  bindConversationRouter(null)
  jest.useRealTimers()
})

it('selects only the committed URL and distinguishes genuinely empty history', async () => {
  useLayoutStore.getState().openNavDrawer()
  const opening = openConversation(request)
  expect(useChannelStore.getState().currentChannelId).toBe('old')
  expect(api.get).not.toHaveBeenCalled()
  await commit()
  expect(await opening).toMatchObject({ status: 'opened', empty: true })
  expect(useChannelStore.getState().currentChannelId).toBe('ch1')
  expect(useLayoutStore.getState().navDrawerOpen).toBe(false)
  expect(useNavigationStore.getState().status).toBe('empty')
})
it('dispatches a queued cold-start request exactly once when Router binds', async () => {
  bindConversationRouter(null)
  const opening = openConversation(request)
  expect(navigate).not.toHaveBeenCalled()
  bindConversationRouter(navigate)
  bindConversationRouter(navigate)
  expect(navigate).toHaveBeenCalledTimes(1)
  await commit()
  expect(await opening).toMatchObject({ status: 'opened' })
})
it('deduplicates an entry and consumes its query without a second history load', async () => {
  jest
    .mocked(api.get)
    .mockResolvedValue({ messages: [makeMessage({ id: 'target', channelId: 'ch1' })], hasMore: false })
  const opening = openConversation({ ...request, position: { kind: 'message', messageId: 'target' } })
  await commit()
  await opening
  const nav = useNavigationStore.getState()
  await useNavigationStore.getState().enterRoute(request, { key: nav.routeKey!, isCurrent: () => true })
  await enter('/channels/s1/ch1', { conversationConsumedId: nav.activeNavId })
  expect(api.get).toHaveBeenCalledTimes(1)
})
it('repeats a same-channel jump with a fresh positioning nonce', async () => {
  jest
    .mocked(api.get)
    .mockResolvedValue({ messages: [makeMessage({ id: 'target', channelId: 'ch1' })], hasMore: false })
  const target = { ...request, position: { kind: 'message' as const, messageId: 'target' } }
  let opening = openConversation(target)
  await commit()
  await opening
  const nonce = useMessageStore.getState().scrollRequestNonce
  opening = openConversation(target)
  await commit()
  await opening
  expect(useMessageStore.getState().scrollRequestNonce).toBeGreaterThan(nonce)
  expect(api.get).toHaveBeenCalledTimes(1)
})
it('preserves latest intent instead of falling back to the unread anchor', async () => {
  useReadStateStore.setState({
    channels: new Map([['ch1', { unreadCount: 3, firstUnreadMessageId: 'unread' } as never]])
  })
  const opening = openConversation({ ...request, position: { kind: 'latest' } })
  await commit()
  expect(await opening).toMatchObject({ status: 'opened' })
  expect(jest.mocked(api.get).mock.calls[0][0]).toBe('/api/channels/ch1/messages?limit=50')
})
it('cancels a slow channel request and rejects its late response even when transport ignores abort', async () => {
  let finish!: (value: unknown) => void
  jest.mocked(api.get).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      })
  )
  const old = openConversation(request)
  const oldRoute = commit()
  await Promise.resolve()
  await Promise.resolve()
  const next = openConversation({ target: { kind: 'dm', conversationId: 'dm1' } })
  await commit()
  await next
  expect(await old).toEqual({ status: 'cancelled' })
  expect(await oldRoute).toEqual({ status: 'cancelled' })
  finish({ messages: [makeMessage({ id: 'obsolete' })], hasMore: false })
  await Promise.resolve()
  await Promise.resolve()
  expect(useServerStore.getState().viewMode).toBe('dm')
  expect(useMessageStore.getState().loadedForChannelId).toBeNull()
  expect(useNavigationStore.getState().error).toBeNull()
})
it('bounds a transport which never settles and permits a full retry', async () => {
  jest.useFakeTimers()
  jest.mocked(api.get).mockImplementationOnce(() => new Promise(() => {}))
  const opening = openConversation(request)
  const route = commit()
  await jest.advanceTimersByTimeAsync(15_001)
  expect(await opening).toEqual({ status: 'error', key: 'historyLoadFailed' })
  expect(await route).toEqual({ status: 'error', key: 'historyLoadFailed' })
  expect(useNavigationStore.getState().isNavigating).toBe(false)
  const retrying = useNavigationStore.getState().error!.retry()
  await commit()
  expect(await retrying).toMatchObject({ status: 'opened' })
})
it('reports a deleted message separately from network failure', async () => {
  const opening = openConversation({ ...request, position: { kind: 'message', messageId: 'deleted' } })
  await commit()
  expect(await opening).toEqual({ status: 'unavailable', key: 'messageUnavailable' })
  expect(useNavigationStore.getState().status).toBe('unavailable')
})
it('ignores a route render that is already obsolete', async () => {
  expect(await useNavigationStore.getState().enterRoute(request, { key: 'stale', isCurrent: () => false })).toEqual({
    status: 'cancelled'
  })
  expect(useChannelStore.getState().currentChannelId).toBe('old')
  expect(api.get).not.toHaveBeenCalled()
})
it('loads the parent and reply through one intent and keeps latest scoped to that thread', async () => {
  const parent = makeMessage({ id: 'parent', channelId: 'ch1' })
  const reply = makeMessage({ id: 'reply', channelId: 'ch1', threadParentId: 'parent' })
  jest.mocked(api.get).mockResolvedValue({ messages: [parent], hasMore: false })
  jest.mocked(api.getThreadMessages).mockResolvedValue({ messages: [reply], hasMore: false })
  let opening = openConversation({
    ...request,
    position: { kind: 'message', messageId: 'reply', threadParentId: 'parent' }
  })
  await commit()
  expect(await opening).toMatchObject({ status: 'opened' })
  expect(useThreadStore.getState()).toMatchObject({
    isOpen: true,
    loadedForParentId: 'parent',
    scrollToMessageId: 'reply'
  })
  useThreadStore.setState({ hasNewer: true })
  opening = openConversation({ ...request, position: { kind: 'latest', threadParentId: 'parent' } })
  await commit()
  await opening
  expect(useThreadStore.getState().hasNewer).toBe(false)
  expect(useThreadStore.getState().scrollToMessageId).toBeNull()
  expect(jest.mocked(api.getThreadMessages).mock.calls.at(-1)![2]).toBeUndefined()
})
it('invalidates a late thread failure when navigation is cancelled', async () => {
  const parent = makeMessage({ id: 'parent', channelId: 'ch1' })
  jest.mocked(api.get).mockResolvedValue({ messages: [parent], hasMore: false })
  let fail!: (cause: unknown) => void
  jest.mocked(api.getThreadMessages).mockImplementationOnce(
    () =>
      new Promise((_resolve, reject) => {
        fail = reject
      })
  )
  const opening = openConversation({ ...request, position: { kind: 'thread', parentId: 'parent' } })
  const route = commit()
  for (let i = 0; i < 10; i++) await Promise.resolve()
  useNavigationStore.getState().reset()
  expect(await opening).toEqual({ status: 'cancelled' })
  expect(await route).toEqual({ status: 'cancelled' })
  fail(new Error('obsolete'))
  await Promise.resolve()
  await Promise.resolve()
  expect(useThreadStore.getState().messagesError).toBeNull()
})
it.each([
  '/channels/s1/ch1?m=reply&thread=parent&other=1',
  '/channels/@me/dm1?m=m1',
  '/channels/s1',
  '/channels/@me',
  '/#/channels/s1/ch1?m=m1'
])('round-trips typed conversation links: %s', (value) => {
  const parsed = parseConversationPath(value)!
  expect(parseConversationPath(conversationPath(parsed))).toEqual(parsed)
})
it.each([
  'https://other.test/channels/s1/ch1',
  '//other.test/channels/@me',
  '/channels/a/b/extra',
  '/settings',
  '/channels/%E0%A4%A'
])('rejects invalid conversation links: %s', (path) => {
  expect(parseConversationPath(path)).toBeNull()
})

it('clears obsolete focus and failure when latest reuses an already-loaded empty window', async () => {
  useMessageStore.setState({
    loadedForChannelId: 'ch1',
    messages: [],
    hasNewer: false,
    scrollToMessageId: 'deleted-target',
    messagesError: 'messageUnavailable'
  })
  const opening = openConversation({ ...request, position: { kind: 'latest' } })
  await commit()
  expect(await opening).toMatchObject({ status: 'opened', empty: true })
  expect(useMessageStore.getState()).toMatchObject({ messagesError: null, scrollToMessageId: null })
  expect(api.get).not.toHaveBeenCalled()
})
it('clears obsolete thread focus/errors when latest can reuse the same reply window', async () => {
  useChannelStore.setState({ currentChannelId: 'ch1' })
  const parent = makeMessage({ id: 'parent', channelId: 'ch1' })
  useMessageStore.setState({ loadedForChannelId: 'ch1', messages: [parent], hasNewer: false })
  useThreadStore.setState({
    isOpen: true,
    channelId: 'ch1',
    parentMessage: parent,
    loadedForParentId: 'parent',
    messages: [],
    hasNewer: false,
    scrollToMessageId: 'deleted-reply',
    focusMessageId: 'deleted-reply',
    messagesError: 'messageUnavailable'
  })
  const opening = openConversation({ ...request, position: { kind: 'latest', threadParentId: 'parent' } })
  await commit()
  expect(await opening).toMatchObject({ status: 'opened' })
  expect(useThreadStore.getState()).toMatchObject({
    messagesError: null,
    scrollToMessageId: null,
    focusMessageId: null
  })
  expect(api.getThreadMessages).not.toHaveBeenCalled()
})
