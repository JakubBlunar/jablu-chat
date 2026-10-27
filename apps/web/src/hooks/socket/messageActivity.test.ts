import { createChannelHandlers } from './channelHandlers'
import { createDmHandlers } from './dmHandlers'
import { channelKey, clearCache, dmKey, peekContext, putContext } from '@/lib/cache/messageCache'
import { makeMessage } from '@/test/factories'
import { useAuthStore } from '@/stores/auth.store'
import { useChannelStore } from '@/stores/channel.store'
import { useServerStore } from '@/stores/server.store'
import { useReadStateStore } from '@/stores/readState.store'
import { useMessageStore } from '@/stores/message.store'
import { useDmStore } from '@/stores/dm.store'
import { useNotifPrefStore } from '@/stores/notifPref.store'
import { showNotification } from '@/lib/notifications'

jest.mock('@/lib/notifications', () => ({ showNotification: jest.fn() }))
jest.mock('@/lib/appVisibility', () => ({ isAppFocused: () => true }))

beforeEach(() => {
  clearCache()
  jest.clearAllMocks()
  useAuthStore.setState({ user: { id: 'me' } } as never)
  useServerStore.setState({ viewMode: 'server' })
  useChannelStore.setState({ currentChannelId: 'active', channels: [] })
  useMessageStore.setState({ messages: [], loadedForChannelId: 'active' })
  useReadStateStore.setState({ channels: new Map(), dms: new Map(), channelToServer: new Map() })
  useNotifPrefStore.setState({ getEffective: () => 'all' })
})

const summary = {
  id: 'new',
  authorId: 'other',
  content: 'preview',
  createdAt: new Date().toISOString(),
  threadParentId: null,
  attachments: [],
  author: { username: 'Sender', displayName: null },
  serverId: 'server'
}

it('marks background cache stale without inserting a preview as a history row, while preserving mention alerts', () => {
  const old = makeMessage({ id: 'old', channelId: 'background' })
  putContext(channelKey('background'), { messages: [old], hasMore: false, hasNewer: false })
  createChannelHandlers().onMessageActivity({
    mode: 'channel',
    contextId: 'background',
    event: 'message:new',
    isMention: true,
    message: summary
  })
  expect(peekContext(channelKey('background'))).toMatchObject({ stale: true, messages: [old] })
  expect(useMessageStore.getState().messages).toEqual([])
  expect(useReadStateStore.getState().channels.get('background')).toMatchObject({
    unreadCount: 1,
    mentionCount: 1,
    firstUnreadMessageId: 'new'
  })
  expect(showNotification).toHaveBeenCalledTimes(1)
})

it('invalidates edits and deletions without creating unread messages or duplicate notifications', () => {
  putContext(channelKey('background'), { messages: [makeMessage()], hasMore: false, hasNewer: false })
  const handlers = createChannelHandlers()
  handlers.onMessageActivity({ mode: 'channel', contextId: 'background', event: 'message:edit' })
  handlers.onMessageActivity({ mode: 'channel', contextId: 'background', event: 'message:delete' })
  expect(peekContext(channelKey('background'))?.stale).toBe(true)
  expect(useReadStateStore.getState().channels.size).toBe(0)
  expect(showNotification).not.toHaveBeenCalled()
})

it('retains background DM previews and badges while leaving the full message cache stale', () => {
  useDmStore.setState({
    currentConversationId: 'other',
    loadedForConvId: 'other',
    messages: [],
    conversations: [{ id: 'background', muted: false }]
  } as never)
  const old = makeMessage({ id: 'old' })
  putContext(dmKey('background'), { messages: [old], hasMore: false, hasNewer: false })
  createDmHandlers().onMessageActivity({ mode: 'dm', contextId: 'background', event: 'dm:new', message: summary })
  expect(peekContext(dmKey('background'))).toMatchObject({ stale: true, messages: [old] })
  expect(useDmStore.getState().messages).toEqual([])
  expect(useDmStore.getState().conversations[0]?.lastMessage?.content).toBe('preview')
  expect(useReadStateStore.getState().dms.get('background')?.unreadCount).toBe(1)
  expect(showNotification).toHaveBeenCalledTimes(1)
})
