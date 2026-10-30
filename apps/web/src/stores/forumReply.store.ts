import { addMessageReaction, removeMessageReaction, replaceMessageInList, removeMessageFromList, messageListPatch } from '@/lib/messageCollection'
import type { Message } from '@chat/shared'
import { create } from 'zustand'
import { api } from '@/lib/api'
import { historyErrorKey, requireMessageTarget } from '@/lib/messageHistory'

interface ForumReplyState {
  channelId: string | null
  postId: string | null
  messages: Message[]
  isLoading: boolean
  hasMore: boolean
  hasNewer: boolean
  focusMessageId: string | null
  scrollToMessageId: string | null
  scrollRequestNonce: number
  loadedForPostId: string | null
  messagesError: string | null

  cancelPendingFetch: () => void
  fetchMessages: (signal?: AbortSignal) => Promise<void>
  fetchOlder: () => Promise<void>
  fetchNewer: () => Promise<void>
  reconcileToLatest: () => Promise<void>
  clearMessages: () => void
  setScrollToMessageId: (id: string | null) => void

  addMessage: (msg: Message) => void
  updateMessage: (msg: Message) => void
  removeMessage: (msgId: string) => void
  addReaction: (messageId: string, emoji: string, userId: string, isCustom?: boolean) => void
  removeReaction: (messageId: string, emoji: string, userId: string) => void
}

let requestId = 0

export const useForumReplyStore = create<ForumReplyState>((set, get) => ({
  channelId: null,
  postId: null,
  messages: [],
  isLoading: false,
  hasMore: false,
  hasNewer: false,
  focusMessageId: null,
  scrollToMessageId: null,
  scrollRequestNonce: 0,
  loadedForPostId: null,
  messagesError: null,

  cancelPendingFetch: () => { ++requestId; set({ isLoading: false }) },

  fetchMessages: async (signal) => {
    const { channelId, postId, focusMessageId } = get()
    if (!channelId || !postId) return
    const fetchId = ++requestId
    set({ isLoading: true, messagesError: null })
    try {
      const result = await api.getThreadMessages(
        channelId,
        postId,
        focusMessageId ? { around: focusMessageId } : undefined,
        ...signal ? [signal] as [AbortSignal] : []
      )
      if (fetchId !== requestId || get().postId !== postId || get().channelId !== channelId) return
      if (focusMessageId) requireMessageTarget(result.messages, focusMessageId)
      set({
        messages: result.messages,
        hasMore: result.hasMore,
        hasNewer: !!result.hasNewer,
        isLoading: false,
        loadedForPostId: postId
      })
    } catch (error) {
      if (fetchId !== requestId || get().postId !== postId || get().channelId !== channelId) return
      console.error('Failed to load forum replies', error)
      set({ isLoading: false, messagesError: historyErrorKey(error) })
    }
  },

  fetchOlder: async () => {
    const { channelId, postId, messages, isLoading } = get()
    if (!channelId || !postId || isLoading || messages.length === 0) return
    const oldestMsg = messages[0]
    const fetchId = ++requestId
    set({ isLoading: true, messagesError: null })
    try {
      const result = await api.getThreadMessages(channelId, postId, { cursor: oldestMsg.id })
      if (fetchId !== requestId || get().postId !== postId || get().channelId !== channelId) return
      set((s) => ({
        messages: [...result.messages, ...s.messages],
        hasMore: result.hasMore,
        isLoading: false
      }))
    } catch (error) {
      if (fetchId !== requestId || get().postId !== postId || get().channelId !== channelId) return
      console.error('Failed to load older forum replies', error)
      set({ isLoading: false, messagesError: historyErrorKey(error) })
    }
  },

  fetchNewer: async () => {
    const { channelId, postId, messages, isLoading, hasNewer } = get()
    if (!channelId || !postId || isLoading || messages.length === 0 || !hasNewer) return
    const newestMsg = messages[messages.length - 1]
    const fetchId = ++requestId
    set({ isLoading: true, messagesError: null })
    try {
      const result = await api.getThreadMessages(channelId, postId, { after: newestMsg.id })
      if (fetchId !== requestId || get().postId !== postId || get().channelId !== channelId) return
      set((s) => {
        const next = [...s.messages]
        for (const msg of result.messages) {
          if (!next.some((m) => m.id === msg.id)) next.push(msg)
        }
        return { messages: next, hasNewer: !!result.hasNewer, isLoading: false }
      })
    } catch (error) {
      if (fetchId !== requestId || get().postId !== postId || get().channelId !== channelId) return
      console.error('Failed to load newer forum replies', error)
      set({ isLoading: false, messagesError: historyErrorKey(error) })
    }
  },

  reconcileToLatest: async () => {
    const { channelId, postId, messages, hasNewer } = get()
    if (!channelId || !postId || messages.length === 0 || !hasNewer) return
    const fetchId = ++requestId
    set({ isLoading: true, messagesError: null })
    try {
      const nextMessages = [...messages]
      let nextHasNewer: boolean = hasNewer
      let cursor = nextMessages[nextMessages.length - 1]?.id
      while (nextHasNewer && cursor) {
        const result = await api.getThreadMessages(channelId, postId, { after: cursor })
        if (fetchId !== requestId || get().postId !== postId || get().channelId !== channelId) return
        for (const msg of result.messages) {
          if (!nextMessages.some((m) => m.id === msg.id)) nextMessages.push(msg)
        }
        nextHasNewer = !!result.hasNewer
        const nextCursor = nextMessages[nextMessages.length - 1]?.id
        if (nextHasNewer && nextCursor === cursor) throw new Error('Forum history did not advance')
        cursor = nextCursor
      }
      set({
        messages: nextMessages,
        hasNewer: nextHasNewer,
        isLoading: false,
        focusMessageId: null
      })
    } catch (error) {
      if (fetchId !== requestId || get().postId !== postId || get().channelId !== channelId) return
      console.error('Failed to load latest forum replies', error)
      set({ isLoading: false, messagesError: historyErrorKey(error) })
    }
  },

  clearMessages: () => {
    ++requestId
    set({
      messages: [],
      isLoading: false,
      messagesError: null,
      focusMessageId: null,
      scrollToMessageId: null,
      hasMore: false,
      hasNewer: false,
      loadedForPostId: null
    })
  },

  setScrollToMessageId: (id) =>
    set((s) => ({
      scrollToMessageId: id,
      scrollRequestNonce: id !== null ? s.scrollRequestNonce + 1 : s.scrollRequestNonce
    })),

  addMessage: (msg) => {
    set((s) => {
      if (s.hasNewer) return s
      if (s.messages.some((m) => m.id === msg.id)) return s
      return { messages: [...s.messages, msg] }
    })
  },

  updateMessage: (message) => set((s) => messageListPatch(s, replaceMessageInList(s.messages, message))),

  removeMessage: (messageId) => set((s) => messageListPatch(s, removeMessageFromList(s.messages, messageId))),

  addReaction: (messageId, emoji, userId, isCustom) => set((s) => messageListPatch(s, addMessageReaction(s.messages, messageId, emoji, userId, isCustom))),

  removeReaction: (messageId, emoji, userId) => set((s) => messageListPatch(s, removeMessageReaction(s.messages, messageId, emoji, userId)))
}))
