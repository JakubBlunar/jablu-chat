import { createChannelHandlers } from './channelHandlers'

jest.mock('@/lib/notifications', () => ({
  showNotification: jest.fn()
}))

import { showNotification } from '@/lib/notifications'
import { useThreadStore } from '@/stores/thread.store'
import { useForumStore } from '@/stores/forum.store'
import { useAuthStore } from '@/stores/auth.store'
import { useChannelStore } from '@/stores/channel.store'
import { useDmStore } from '@/stores/dm.store'
import { useMessageStore } from '@/stores/message.store'
import { useNotifPrefStore } from '@/stores/notifPref.store'
import { useReadStateStore } from '@/stores/readState.store'
import { useServerStore } from '@/stores/server.store'

const mockShowNotification = jest.mocked(showNotification)

function resetStores() {
  useAuthStore.setState({ user: { id: 'me' } } as any)
  useServerStore.setState({ viewMode: 'server' } as any)
  useChannelStore.setState({ currentChannelId: 'ch1', channels: [] } as any)
  useMessageStore.setState({
    addMessage: jest.fn(),
    updateMessage: jest.fn(),
    removeMessage: jest.fn(),
    setTypingUser: jest.fn(),
    removeTypingUser: jest.fn(),
    addReaction: jest.fn(),
    removeReaction: jest.fn(),
    updatePoll: jest.fn(),
    updateThreadCount: jest.fn(),
    setLinkPreviews: jest.fn(),
  } as any)
  useThreadStore.setState({
    addMessage: jest.fn(),
    updateMessage: jest.fn(),
    deleteMessage: jest.fn(),
    messages: [],
  } as any)
  useForumStore.setState({
    currentPostId: null,
    channelId: null,
    addPost: jest.fn(),
    updatePost: jest.fn(),
    removePost: jest.fn(),
    updateReplyCount: jest.fn(),
  } as any)
  useDmStore.setState({
    addReaction: jest.fn(),
    removeReaction: jest.fn(),
  } as any)
  useReadStateStore.setState({
    ackChannel: jest.fn(),
    incrementChannel: jest.fn(),
  } as any)
  useNotifPrefStore.setState({ getEffective: () => 'all' } as any)
}

let handlers: ReturnType<typeof createChannelHandlers>
let throttledAck: jest.Mock

beforeEach(() => {
  resetStores()
  jest.clearAllMocks()
  throttledAck = jest.fn((fn: () => void) => fn())
  handlers = createChannelHandlers(throttledAck)
})

describe('onMessageNew', () => {
  const baseMsg = {
    id: 'm1',
    channelId: 'ch1',
    authorId: 'other',
    content: 'hello',
    createdAt: '2024-01-01T00:00:00Z',
    author: { username: 'bob', displayName: 'Bob' },
  }

  it('adds message to store when viewing the channel', () => {
    handlers.onMessageNew(baseMsg as any)

    expect(useMessageStore.getState().addMessage).toHaveBeenCalledWith(baseMsg)
    expect(throttledAck).toHaveBeenCalled()
  })

  it('routes thread messages to thread store', () => {
    const threadMsg = { ...baseMsg, threadParentId: 'parent1' }
    handlers.onMessageNew(threadMsg as any)

    expect(useThreadStore.getState().addMessage).toHaveBeenCalledWith(threadMsg)
    expect(useMessageStore.getState().addMessage).not.toHaveBeenCalled()
  })

  it('increments unread for non-viewed channels', () => {
    useChannelStore.setState({ currentChannelId: 'other-ch' } as any)

    handlers.onMessageNew({ ...baseMsg, serverId: 's1' } as any)

    expect(useReadStateStore.getState().incrementChannel).toHaveBeenCalledWith('ch1', false, 's1')
  })

  it('counts mentions when user is mentioned', () => {
    useChannelStore.setState({ currentChannelId: 'other-ch' } as any)

    handlers.onMessageNew({
      ...baseMsg,
      serverId: 's1',
      mentionedUserIds: ['me'],
    } as any)

    expect(useReadStateStore.getState().incrementChannel).toHaveBeenCalledWith('ch1', true, 's1')
  })

  it('counts @everyone as mention', () => {
    useChannelStore.setState({ currentChannelId: 'other-ch' } as any)

    handlers.onMessageNew({
      ...baseMsg,
      serverId: 's1',
      mentionEveryone: true,
    } as any)

    expect(useReadStateStore.getState().incrementChannel).toHaveBeenCalledWith('ch1', true, 's1')
  })

  it('sends notification for non-viewed channels', () => {
    useChannelStore.setState({ currentChannelId: 'other-ch', channels: [{ id: 'ch1', name: 'general' }] } as any)

    handlers.onMessageNew({ ...baseMsg, serverId: 's1' } as any)

    expect(mockShowNotification).toHaveBeenCalledWith(
      '#general',
      'Bob: hello',
      '/channels/s1/ch1',
      undefined,
      'message'
    )
  })

  it('sends mention-type notification when mentioned', () => {
    useChannelStore.setState({ currentChannelId: 'other-ch', channels: [{ id: 'ch1', name: 'general' }] } as any)

    handlers.onMessageNew({ ...baseMsg, serverId: 's1', mentionedUserIds: ['me'] } as any)

    expect(mockShowNotification).toHaveBeenCalledWith(
      '#general',
      expect.any(String),
      expect.any(String),
      undefined,
      'mention'
    )
  })

  it('skips notification when pref is "none"', () => {
    useChannelStore.setState({ currentChannelId: 'other-ch' } as any)
    useNotifPrefStore.setState({ getEffective: () => 'none' } as any)

    handlers.onMessageNew({ ...baseMsg, serverId: 's1' } as any)

    expect(mockShowNotification).not.toHaveBeenCalled()
  })

  it('skips notification for "mentions" pref when not mentioned', () => {
    useChannelStore.setState({ currentChannelId: 'other-ch' } as any)
    useNotifPrefStore.setState({ getEffective: () => 'mentions' } as any)

    handlers.onMessageNew({ ...baseMsg, serverId: 's1' } as any)

    expect(mockShowNotification).not.toHaveBeenCalled()
  })

  it('does not increment unread for own messages', () => {
    useChannelStore.setState({ currentChannelId: 'other-ch' } as any)

    handlers.onMessageNew({ ...baseMsg, authorId: 'me' } as any)

    expect(useReadStateStore.getState().incrementChannel).not.toHaveBeenCalled()
  })
})

describe('onReactionAdd', () => {
  it('routes DM reactions to dmStore', () => {
    handlers.onReactionAdd({ messageId: 'm1', emoji: '👍', userId: 'u1', isCustom: false, conversationId: 'dm1' })
    expect(useDmStore.getState().addReaction).toHaveBeenCalledWith('m1', '👍', 'u1', false)
  })

  it('routes channel reactions to messageStore', () => {
    handlers.onReactionAdd({ messageId: 'm1', emoji: '👍', userId: 'u1', isCustom: false })
    expect(useMessageStore.getState().addReaction).toHaveBeenCalledWith('m1', '👍', 'u1', false)
  })
})

describe('onReactionRemove', () => {
  it('routes DM reactions to dmStore', () => {
    handlers.onReactionRemove({ messageId: 'm1', emoji: '👍', userId: 'u1', isCustom: false, conversationId: 'dm1' })
    expect(useDmStore.getState().removeReaction).toHaveBeenCalledWith('m1', '👍', 'u1')
  })
})

describe('onMessageDelete', () => {
  it('removes message from stores', () => {
    handlers.onMessageDelete({ messageId: 'm1', channelId: 'ch1' })

    expect(useThreadStore.getState().deleteMessage).toHaveBeenCalledWith('m1')
    expect(useMessageStore.getState().removeMessage).toHaveBeenCalledWith('m1')
  })
})

describe('onLinkPreviews', () => {
  it('sets link previews on the message', () => {
    handlers.onLinkPreviews({ messageId: 'm1', linkPreviews: [{ url: 'https://x.com' }] as any })

    expect(useMessageStore.getState().setLinkPreviews).toHaveBeenCalledWith('m1', [{ url: 'https://x.com' }])
  })
})

describe('onMessagePin / onMessageUnpin', () => {
  it('adjusts pinned count on pin', () => {
    useChannelStore.setState({
      ...useChannelStore.getState(),
      adjustPinnedCount: jest.fn()
    } as any)

    const msg = { id: 'm1', channelId: 'ch1', pinnedAt: '2024-01-01' } as any
    handlers.onMessagePin(msg)

    expect(useChannelStore.getState().adjustPinnedCount).toHaveBeenCalledWith('ch1', 1)
  })
})

describe('onForumPostCreated', () => {
  it('adds post to forum store', () => {
    const post = { id: 'p1', title: 'Test' } as any
    handlers.onForumPostCreated(post)

    expect(useForumStore.getState().addPost).toHaveBeenCalledWith(post)
  })
})
