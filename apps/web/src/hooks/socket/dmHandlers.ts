import { messageNotificationUrl, type Message } from '@chat/shared'
import { api, type DmConversation } from '@/lib/api'
import {
  cacheAddMessage,
  cacheRemoveMessage,
  cacheSetLinkPreviews,
  cacheUpdateMessage
} from '@/lib/cache/contextMutations'
import { dmKey } from '@/lib/cache/messageCache'
import { showNotification } from '@/lib/notifications'
import { isAppFocused } from '@/lib/appVisibility'
import { useAuthStore } from '@/stores/auth.store'
import { useDmStore } from '@/stores/dm.store'
import { useReadStateStore } from '@/stores/readState.store'
import { useServerStore } from '@/stores/server.store'
import { showToast } from '@/stores/toast.store'
import { notifBody } from './helpers'
import type { DmDeletePayload, DmLinkPreviewPayload, DmMessagePayload, DmTypingPayload } from './types'

export function createDmHandlers() {
  const refreshRequests = new Map<string, object>()
  const onDmConversationRefresh = async ({ conversationId }: { conversationId: string }) => {
    const request = {}
    refreshRequests.set(conversationId, request)
    try {
      const conversation = await api.getDmConversation(conversationId)
      if (refreshRequests.get(conversationId) === request) useDmStore.getState().addOrUpdateConversation(conversation)
    } catch (error) {
      if (refreshRequests.get(conversationId) !== request) return
      console.error('Failed to refresh conversation', error)
      showToast('Conversation update failed', 'Please reopen the conversation to retry.')
    }
  }
  const onDmConversationRemoved = ({ conversationId }: { conversationId: string }) => {
    refreshRequests.delete(conversationId)
    useDmStore.getState().removeConversation(conversationId)
    void useReadStateStore.getState().fetchAll()
  }
  const onDmReadStateRefresh = () => { void useReadStateStore.getState().fetchAll() }

  const onDmNew = (payload: DmMessagePayload) => {
    const dmState = useDmStore.getState()
    const currentConvId = dmState.currentConversationId
    const viewMode = useServerStore.getState().viewMode
    const myId = useAuthStore.getState().user?.id
    const isViewingConversation = viewMode === 'dm' && payload.conversationId === currentConvId
    if (isViewingConversation) {
      dmState.addMessage(payload)
    } else {
      cacheAddMessage(dmKey(payload.conversationId), payload)
    }
    const notify = (conversation: Pick<DmConversation, 'muted'>) => {
      if (payload.authorId === myId || conversation.muted) return
      if (!isViewingConversation || !isAppFocused()) {
        const author = payload.author?.displayName ?? payload.author?.username ?? 'Someone'
        showNotification(`DM from ${author}`, notifBody(payload), messageNotificationUrl(`/channels/@me/${payload.conversationId}`, payload.id), undefined, 'mention')
      }
    }
    if (payload.authorId !== myId) {
      useReadStateStore.getState().incrementDm(payload.conversationId, payload.id)
    }

    const existing = dmState.conversations.find((c) => c.id === payload.conversationId)
    if (!existing) {
      const request = {}
      refreshRequests.set(payload.conversationId, request)
      api
        .getDmConversation(payload.conversationId)
        .then((conv) => {
          if (refreshRequests.get(payload.conversationId) !== request) return
          useDmStore.getState().addOrUpdateConversation(conv)
          useDmStore.getState().updateConversationLastMessage(payload.conversationId, lastMessage)
          notify(conv)
        })
        .catch((error) => { console.error('Failed to load incoming conversation', error) })
    } else notify(existing)

    const lastMessage = {
      content: payload.content ?? null,
      authorId: payload.authorId ?? '',
      authorName: payload.author?.displayName ?? payload.author?.username ?? null,
      createdAt: payload.createdAt,
      attachment: payload.attachments?.[0] ? { type: payload.attachments[0].type, filename: payload.attachments[0].filename } : null
    }
    dmState.updateConversationLastMessage(payload.conversationId, lastMessage)
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

  return { onDmNew, onDmEdit, onDmDelete, onDmTyping, onDmPin, onDmUnpin, onDmLinkPreviews, onDmConversationRefresh, onDmConversationRemoved, onDmReadStateRefresh }
}
