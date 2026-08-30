import type { Message } from '@chat/shared'
import { api } from '@/lib/api'
import {
  cacheAddMessage,
  cacheRemoveMessage,
  cacheSetLinkPreviews,
  cacheUpdateMessage
} from '@/lib/cache/contextMutations'
import { dmKey } from '@/lib/cache/messageCache'
import { showNotification } from '@/lib/notifications'
import { useAuthStore } from '@/stores/auth.store'
import { useDmStore } from '@/stores/dm.store'
import { useReadStateStore } from '@/stores/readState.store'
import { useServerStore } from '@/stores/server.store'
import { notifBody } from './helpers'
import type { DmDeletePayload, DmLinkPreviewPayload, DmMessagePayload, DmTypingPayload, ThrottledAck } from './types'

export function createDmHandlers(throttledAck: ThrottledAck) {
  const onDmNew = (payload: DmMessagePayload) => {
    const dmState = useDmStore.getState()
    const currentConvId = dmState.currentConversationId
    const viewMode = useServerStore.getState().viewMode
    const myId = useAuthStore.getState().user?.id
    const isViewingConversation = viewMode === 'dm' && payload.conversationId === currentConvId
    if (isViewingConversation) {
      dmState.addMessage(payload)
      throttledAck(() => useReadStateStore.getState().ackDm(currentConvId!))
    } else {
      cacheAddMessage(dmKey(payload.conversationId), payload)

      if (payload.authorId !== myId) {
        useReadStateStore.getState().incrementDm(payload.conversationId, payload.id)
        const author = payload.author?.displayName ?? payload.author?.username ?? 'Someone'
        const preview = notifBody(payload)
        const url = `/channels/@me/${payload.conversationId}`
        showNotification(`DM from ${author}`, preview, url, undefined, 'mention')
      }
    }

    const inList = dmState.conversations.some((c) => c.id === payload.conversationId)
    if (!inList) {
      api
        .getDmConversation(payload.conversationId)
        .then((conv) => {
          useDmStore.getState().addOrUpdateConversation(conv)
        })
        .catch(() => {})
    }

    dmState.updateConversationLastMessage(payload.conversationId, {
      content: payload.content ?? null,
      authorId: payload.authorId ?? '',
      createdAt: payload.createdAt
    })
  }

  const onDmEdit = (payload: DmMessagePayload) => {
    const currentConvId = useDmStore.getState().currentConversationId
    if (payload.conversationId === currentConvId) {
      useDmStore.getState().updateMessage(payload)
    } else {
      cacheUpdateMessage(payload)
    }
  }

  const onDmDelete = (payload: DmDeletePayload) => {
    const currentConvId = useDmStore.getState().currentConversationId
    if (payload.conversationId === currentConvId) {
      useDmStore.getState().removeMessage(payload.messageId)
    } else {
      cacheRemoveMessage(dmKey(payload.conversationId), payload.messageId)
    }
  }

  const onDmTyping = (_payload: DmTypingPayload) => {}

  const onDmPin = (msg: Message) => {
    useDmStore.getState().updateMessage(msg)
    cacheUpdateMessage(msg)
  }

  const onDmUnpin = (msg: Message) => {
    useDmStore.getState().updateMessage(msg)
    cacheUpdateMessage(msg)
  }

  const onDmLinkPreviews = (payload: DmLinkPreviewPayload) => {
    const currentConvId = useDmStore.getState().currentConversationId
    if (payload.conversationId === currentConvId) {
      const msgs = useDmStore.getState().messages
      const msg = msgs.find((m) => m.id === payload.messageId)
      if (msg) {
        useDmStore.getState().updateMessage({
          ...msg,
          linkPreviews: payload.linkPreviews
        })
      }
    } else {
      cacheSetLinkPreviews(payload.messageId, payload.linkPreviews)
    }
  }

  return { onDmNew, onDmEdit, onDmDelete, onDmTyping, onDmPin, onDmUnpin, onDmLinkPreviews }
}
