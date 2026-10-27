import { messageNotificationUrl, type ForumPost, type Message, type Poll } from '@chat/shared'
import i18n from 'i18next'
import {
  cacheAddMessage,
  cacheAddReaction,
  cacheRemoveMessage,
  cacheRemoveReaction,
  cacheSetLinkPreviews,
  cacheUpdateMessage,
  cacheUpdatePoll,
  cacheUpdateThreadCount
} from '@/lib/cache/contextMutations'
import { channelKey, markStale } from '@/lib/cache/messageCache'
import type { MessageActivity } from '@chat/shared'
import { useInboxStore } from '@/stores/inbox.store'
import { useThreadStore } from '@/stores/thread.store'
import { useForumStore } from '@/stores/forum.store'
import { useAuthStore } from '@/stores/auth.store'
import { useChannelStore } from '@/stores/channel.store'
import { useDmStore } from '@/stores/dm.store'
import { useMessageStore } from '@/stores/message.store'
import { useNotifPrefStore } from '@/stores/notifPref.store'
import { useReadStateStore } from '@/stores/readState.store'
import { useServerStore } from '@/stores/server.store'
import { showNotification } from '@/lib/notifications'
import { isAppFocused } from '@/lib/appVisibility'
import { notifBody } from './helpers'
import type { MessageDeletePayload, TypingPayload, ReactionPayload, LinkPreviewPayload } from './types'

/**
 * Thread replies previously produced no client-side alert at all, so a reply
 * that arrived while you had the app open was silent even though the server
 * recorded it in the bell.
 *
 * Participation is judged from the thread the client has already loaded, so this
 * only fires for threads the user has actually opened. The server-side push and
 * bell row remain the authoritative delivery for everyone else.
 */
function notifyThreadReply(
  msg: Message & { background?: boolean; mentionedUserIds?: string[]; serverId?: string }
) {
  const myId = useAuthStore.getState().user?.id
  if (!myId || msg.authorId === myId) return

  const thread = useThreadStore.getState()
  // Already reading this thread — the message is on screen.
  if (thread.isOpen && thread.parentMessage?.id === msg.threadParentId && isAppFocused()) return

  const isMentioned = (msg.mentionedUserIds ?? []).includes(myId)
  const isParticipant =
    thread.parentMessage?.id === msg.threadParentId &&
    (thread.parentMessage?.authorId === myId ||
      thread.messages.some((m) => m.authorId === myId))
  if (!isMentioned && !isParticipant) return

  if (msg.channelId) {
    const level = useNotifPrefStore.getState().getEffective(msg.channelId, msg.serverId)
    if (level === 'none') return
  }

  const author = msg.author?.displayName ?? msg.author?.username ?? 'Someone'
  const url =
    msg.serverId && msg.channelId
      ? messageNotificationUrl(`/channels/${msg.serverId}/${msg.channelId}`, msg.id, msg.threadParentId)
      : undefined
  showNotification(
    i18n.t('chat:notification.threadReplyTitle'),
    i18n.t('chat:notification.message', { author, preview: msg.background && msg.content ? msg.content : notifBody(msg) }),
    url,
    undefined,
    isMentioned ? 'mention' : 'message'
  )
}

export function createChannelHandlers() {
  const onMessageNew = (msg: Message & { background?: boolean; mentionedUserIds?: string[]; serverId?: string; mentionEveryone?: boolean; mentionHere?: boolean }) => {
    if (msg.threadParentId) {
      if (!msg.background) useThreadStore.getState().addMessage(msg)
      if (!msg.background && useForumStore.getState().currentPostId === msg.threadParentId) {
        window.dispatchEvent(new CustomEvent('forum-reply', { detail: msg }))
      }
      notifyThreadReply(msg)
      return
    }
    const channelId = useChannelStore.getState().currentChannelId
    const viewMode = useServerStore.getState().viewMode
    const myId = useAuthStore.getState().user?.id
    const isViewingChannel = viewMode === 'server' && msg.channelId != null && msg.channelId === channelId
    if (isViewingChannel && !msg.background) {
      useMessageStore.getState().addMessage(msg)
    }

    if (msg.channelId && !isViewingChannel && !msg.background) {
      // Keep the cached copy current even for the user's own messages sent
      // from another device, which the unread path below deliberately skips.
      cacheAddMessage(channelKey(msg.channelId), msg)
    }

    if (msg.channelId && msg.authorId !== myId) {
      const isMentioned = myId
        ? (msg.mentionedUserIds ?? []).includes(myId) || !!msg.mentionEveryone || !!msg.mentionHere
        : false
      useReadStateStore.getState().incrementChannel(msg.channelId, isMentioned, msg.serverId, msg.id)

      const level = useNotifPrefStore.getState().getEffective(msg.channelId, msg.serverId)
      if ((!isViewingChannel || !isAppFocused()) && level !== 'none' && (level !== 'mentions' || isMentioned)) {
        const author = msg.author?.displayName ?? msg.author?.username ?? 'Someone'
        const preview = msg.background && msg.content ? msg.content : notifBody(msg)
        const url = msg.serverId
          ? messageNotificationUrl(`/channels/${msg.serverId}/${msg.channelId}`, msg.id)
          : undefined
        const ch = useChannelStore.getState().channels.find((c) => c.id === msg.channelId)
        const channelTitle = i18n.t('chat:notification.channelTitle', {
          channel: ch?.name ?? msg.channelId.slice(0, 8)
        })
        showNotification(
          channelTitle,
          i18n.t('chat:notification.message', { author, preview }),
          url,
          undefined,
          isMentioned ? 'mention' : 'message'
        )
      }
    }
  }

  const onMessageActivity = (activity: MessageActivity) => {
    if (activity.mode !== 'channel') return
    markStale(channelKey(activity.contextId))
    useInboxStore.getState().bump()
    if (activity.message && activity.event === 'message:new') {
      const myId = useAuthStore.getState().user?.id
      onMessageNew({ ...activity.message, channelId: activity.contextId, background: true,
        mentionedUserIds: activity.isMention && myId ? [myId] : [] } as unknown as Parameters<typeof onMessageNew>[0])
    }
  }

  const onMessageEdit = (msg: Message) => {
    useThreadStore.getState().updateMessage(msg)
    if (msg.threadParentId && useForumStore.getState().currentPostId === msg.threadParentId) {
      window.dispatchEvent(new CustomEvent('forum-reply:edit', { detail: msg }))
    }
    const channelId = useChannelStore.getState().currentChannelId
    if (msg.channelId != null && msg.channelId === channelId) {
      useMessageStore.getState().updateMessage(msg)
    } else {
      cacheUpdateMessage(msg)
    }
  }

  const onMessageDelete = (payload: MessageDeletePayload) => {
    useThreadStore.getState().deleteMessage(payload.messageId)
    const forum = useForumStore.getState()
    if (forum.currentPostId && forum.channelId === payload.channelId) {
      window.dispatchEvent(new CustomEvent('forum-reply:delete', { detail: payload.messageId }))
    }
    const channelId = useChannelStore.getState().currentChannelId
    if (payload.channelId === channelId) {
      useMessageStore.getState().removeMessage(payload.messageId)
    } else if (payload.channelId) {
      cacheRemoveMessage(channelKey(payload.channelId), payload.messageId)
    }
  }

  const onUserTyping = (payload: TypingPayload) => {
    const channelId = useChannelStore.getState().currentChannelId
    if (payload.channelId === channelId) {
      useMessageStore.getState().setTypingUser(payload.channelId, payload.userId, payload.username)
    }
  }

  const onUserTypingStop = (payload: { userId: string; channelId: string }) => {
    const channelId = useChannelStore.getState().currentChannelId
    if (payload.channelId === channelId) {
      useMessageStore.getState().removeTypingUser(payload.userId)
    }
  }

  const onReactionAdd = (payload: ReactionPayload) => {
    if (payload.conversationId) {
      useDmStore.getState().addReaction(payload.messageId, payload.emoji, payload.userId, payload.isCustom)
    } else {
      const threadMsg = useThreadStore.getState().messages.find((m) => m.id === payload.messageId)
      const currentForumPostId = useForumStore.getState().currentPostId
      if ((threadMsg?.threadParentId && currentForumPostId === threadMsg.threadParentId) || currentForumPostId) {
        window.dispatchEvent(new CustomEvent('forum-reply:reaction-add', { detail: payload }))
      }
      // Guarded no-ops in whichever store doesn't hold the message.
      useThreadStore.getState().addReaction(payload.messageId, payload.emoji, payload.userId, payload.isCustom)
      useMessageStore.getState().addReaction(payload.messageId, payload.emoji, payload.userId, payload.isCustom)
      cacheAddReaction(payload.messageId, payload.emoji, payload.userId, payload.isCustom)
    }
  }

  const onReactionRemove = (payload: ReactionPayload) => {
    if (payload.conversationId) {
      useDmStore.getState().removeReaction(payload.messageId, payload.emoji, payload.userId)
    } else {
      const threadMsg = useThreadStore.getState().messages.find((m) => m.id === payload.messageId)
      const currentForumPostId = useForumStore.getState().currentPostId
      if ((threadMsg?.threadParentId && currentForumPostId === threadMsg.threadParentId) || currentForumPostId) {
        window.dispatchEvent(new CustomEvent('forum-reply:reaction-remove', { detail: payload }))
      }
      // Guarded no-ops in whichever store doesn't hold the message.
      useThreadStore.getState().removeReaction(payload.messageId, payload.emoji, payload.userId)
      useMessageStore.getState().removeReaction(payload.messageId, payload.emoji, payload.userId)
      cacheRemoveReaction(payload.messageId, payload.emoji, payload.userId)
    }
  }

  const onMessagePin = (msg: Message) => {
    useThreadStore.getState().updateMessage(msg)
    if (msg.threadParentId && useForumStore.getState().currentPostId === msg.threadParentId) {
      window.dispatchEvent(new CustomEvent('forum-reply:pin', { detail: msg }))
    }
    useMessageStore.getState().updateMessage(msg)
    cacheUpdateMessage(msg)
    if (msg.channelId) {
      useChannelStore.getState().adjustPinnedCount(msg.channelId, 1)
    }
  }

  const onMessageUnpin = (msg: Message) => {
    useThreadStore.getState().updateMessage(msg)
    if (msg.threadParentId && useForumStore.getState().currentPostId === msg.threadParentId) {
      window.dispatchEvent(new CustomEvent('forum-reply:unpin', { detail: msg }))
    }
    useMessageStore.getState().updateMessage(msg)
    cacheUpdateMessage(msg)
    if (msg.channelId) {
      useChannelStore.getState().adjustPinnedCount(msg.channelId, -1)
    }
  }

  const onPollVote = (poll: Poll) => {
    useMessageStore.getState().updatePoll(poll)
    cacheUpdatePoll(poll)
  }

  const onThreadUpdate = (payload: {
    parentId: string
    threadCount: number
    lastThreadReply?: {
      content: string | null
      author: { id: string; username: string; displayName?: string | null; avatarUrl: string | null } | null
      createdAt: string | Date
    }
  }) => {
    const raw = payload.lastThreadReply
    const lastThreadReply: Message['lastThreadReply'] =
      raw == null
        ? undefined
        : {
            content: raw.content,
            author: raw.author,
            createdAt:
              typeof raw.createdAt === 'string'
                ? raw.createdAt
                : raw.createdAt instanceof Date
                  ? raw.createdAt.toISOString()
                  : String(raw.createdAt)
          }
    useMessageStore.getState().updateThreadCount(payload.parentId, payload.threadCount, lastThreadReply)
    cacheUpdateThreadCount(payload.parentId, payload.threadCount, lastThreadReply)
    useForumStore.getState().updateReplyCount(payload.parentId, payload.threadCount, lastThreadReply?.createdAt)
  }

  const onNewMessageForThread = (msg: Message) => {
    if (msg.threadParentId) {
      useThreadStore.getState().addMessage(msg)
      if (useForumStore.getState().currentPostId === msg.threadParentId) {
        window.dispatchEvent(new CustomEvent('forum-reply', { detail: msg }))
      }
    }
  }

  const onLinkPreviews = (payload: LinkPreviewPayload) => {
    useMessageStore.getState().setLinkPreviews(payload.messageId, payload.linkPreviews)
    cacheSetLinkPreviews(payload.messageId, payload.linkPreviews)
  }

  const onChannelReorder = (payload: { channelIds: string[] }) => {
    useChannelStore.getState().applyReorder(payload.channelIds)
  }

  const onForumPostCreated = (post: ForumPost) => {
    useForumStore.getState().addPost(post)
  }

  const onForumPostUpdated = (post: ForumPost) => {
    useForumStore.getState().updatePost(post)
  }

  const onForumPostDeleted = (payload: { postId: string }) => {
    useForumStore.getState().removePost(payload.postId)
  }

  return {
    onMessageActivity,
    onMessageNew, onMessageEdit, onMessageDelete, onUserTyping, onUserTypingStop,
    onReactionAdd, onReactionRemove, onMessagePin, onMessageUnpin,
    onPollVote, onThreadUpdate, onNewMessageForThread, onLinkPreviews,
    onChannelReorder, onForumPostCreated, onForumPostUpdated, onForumPostDeleted
  }
}
