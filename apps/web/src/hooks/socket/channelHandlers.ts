import type { Message, Poll } from '@chat/shared'
import { useThreadStore } from '@/stores/thread.store'
import { useAuthStore } from '@/stores/auth.store'
import { useChannelStore } from '@/stores/channel.store'
import { useDmStore } from '@/stores/dm.store'
import { useMessageStore } from '@/stores/message.store'
import { useNotifPrefStore } from '@/stores/notifPref.store'
import { useReadStateStore } from '@/stores/readState.store'
import { useServerStore } from '@/stores/server.store'
import { showNotification } from '@/lib/notifications'
import { notifBody } from './helpers'
import type { MessageDeletePayload, TypingPayload, ReactionPayload, LinkPreviewPayload, ThrottledAck } from './types'

export function createChannelHandlers(throttledAck: ThrottledAck) {
  const onMessageNew = (msg: Message & { mentionedUserIds?: string[]; serverId?: string; mentionEveryone?: boolean; mentionHere?: boolean }) => {
    if (msg.threadParentId) {
      useThreadStore.getState().addMessage(msg)
    }
    const channelId = useChannelStore.getState().currentChannelId
    const viewMode = useServerStore.getState().viewMode
    const myId = useAuthStore.getState().user?.id
    const isViewingChannel = viewMode === 'server' && msg.channelId != null && msg.channelId === channelId
    if (isViewingChannel) {
      useMessageStore.getState().addMessage(msg)
      throttledAck(() => useReadStateStore.getState().ackChannel(channelId!))
    } else if (msg.channelId && msg.authorId !== myId) {
      const isMentioned = myId
        ? (msg.mentionedUserIds ?? []).includes(myId) || !!msg.mentionEveryone || !!msg.mentionHere
        : false
      useReadStateStore.getState().incrementChannel(msg.channelId, isMentioned, msg.serverId)

      const level = useNotifPrefStore.getState().getEffective(msg.channelId, msg.serverId)
      if (level !== 'none' && (level !== 'mentions' || isMentioned)) {
        const author = msg.author?.displayName ?? msg.author?.username ?? 'Someone'
        const preview = notifBody(msg)
        const url = msg.serverId ? `/channels/${msg.serverId}/${msg.channelId}` : undefined
        const ch = useChannelStore.getState().channels.find((c) => c.id === msg.channelId)
        const channelTitle = ch ? `#${ch.name}` : `#${msg.channelId.slice(0, 8)}`
        showNotification(channelTitle, `${author}: ${preview}`, url, undefined, isMentioned ? 'mention' : 'message')
      }
    }
  }

  const onMessageEdit = (msg: Message) => {
    useThreadStore.getState().updateMessage(msg)
    const channelId = useChannelStore.getState().currentChannelId
    if (msg.channelId != null && msg.channelId === channelId) {
      useMessageStore.getState().updateMessage(msg)
    }
  }

  const onMessageDelete = (payload: MessageDeletePayload) => {
    useThreadStore.getState().deleteMessage(payload.messageId)
    const channelId = useChannelStore.getState().currentChannelId
    if (payload.channelId === channelId) {
      useMessageStore.getState().removeMessage(payload.messageId)
    }
  }

  const onUserTyping = (payload: TypingPayload) => {
    const channelId = useChannelStore.getState().currentChannelId
    if (payload.channelId === channelId) {
      useMessageStore.getState().setTypingUser(payload.channelId, payload.userId, payload.username)
    }
  }

  const onReactionAdd = (payload: ReactionPayload) => {
    if (payload.conversationId) {
      useDmStore.getState().addReaction(payload.messageId, payload.emoji, payload.userId)
    } else {
      useMessageStore.getState().addReaction(payload.messageId, payload.emoji, payload.userId)
    }
  }

  const onReactionRemove = (payload: ReactionPayload) => {
    if (payload.conversationId) {
      useDmStore.getState().removeReaction(payload.messageId, payload.emoji, payload.userId)
    } else {
      useMessageStore.getState().removeReaction(payload.messageId, payload.emoji, payload.userId)
    }
  }

  const onMessagePin = (msg: Message) => {
    useMessageStore.getState().updateMessage(msg)
    if (msg.channelId) {
      useChannelStore.getState().adjustPinnedCount(msg.channelId, 1)
    }
  }

  const onMessageUnpin = (msg: Message) => {
    useMessageStore.getState().updateMessage(msg)
    if (msg.channelId) {
      useChannelStore.getState().adjustPinnedCount(msg.channelId, -1)
    }
  }

  const onPollVote = (poll: Poll) => {
    useMessageStore.getState().updatePoll(poll)
  }

  const onThreadUpdate = (payload: { parentId: string; threadCount: number; lastThreadMessage?: { authorId: string; createdAt: string } }) => {
    useMessageStore.getState().updateThreadCount(payload.parentId, payload.threadCount)
  }

  const onNewMessageForThread = (msg: Message) => {
    if (msg.threadParentId) {
      useThreadStore.getState().addMessage(msg)
    }
  }

  const onLinkPreviews = (payload: LinkPreviewPayload) => {
    useMessageStore.getState().setLinkPreviews(payload.messageId, payload.linkPreviews)
  }

  const onChannelReorder = (payload: { channelIds: string[] }) => {
    useChannelStore.getState().applyReorder(payload.channelIds)
  }

  return {
    onMessageNew, onMessageEdit, onMessageDelete, onUserTyping,
    onReactionAdd, onReactionRemove, onMessagePin, onMessageUnpin,
    onPollVote, onThreadUpdate, onNewMessageForThread, onLinkPreviews,
    onChannelReorder
  }
}
