import type { Message } from '@chat/shared'
import { create } from 'zustand'
import { api } from '@/lib/api'

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

  fetchMessages: () => Promise<void>
  fetchOlder: () => Promise<void>
  fetchNewer: () => Promise<void>
  reconcileToLatest: () => Promise<void>
  clearMessages: () => void
  setScrollToMessageId: (id: string | null) => void

  addMessage: (msg: Message) => void
  updateMessage: (msg: Message) => void
  removeMessage: (msgId: string) => void
}

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

  fetchMessages: async () => {
    const { channelId, postId, focusMessageId } = get()
    if (!channelId || !postId) return
    set({ isLoading: true })
    try {
      const result = await api.getThreadMessages(
        channelId,
        postId,
        focusMessageId ? { around: focusMessageId } : undefined
      )
      set({
        messages: result.messages,
        hasMore: result.hasMore,
        hasNewer: !!result.hasNewer,
        isLoading: false,
        loadedForPostId: postId
      })
    } catch {
      set({ isLoading: false })
    }
  },

  fetchOlder: async () => {
    const { channelId, postId, messages, isLoading } = get()
    if (!channelId || !postId || isLoading || messages.length === 0) return
    const oldestMsg = messages[0]
    set({ isLoading: true })
    try {
      const result = await api.getThreadMessages(channelId, postId, { cursor: oldestMsg.id })
      set((s) => ({
        messages: [...result.messages, ...s.messages],
        hasMore: result.hasMore,
        isLoading: false
      }))
    } catch {
      set({ isLoading: false })
    }
  },

  fetchNewer: async () => {
    const { channelId, postId, messages, isLoading, hasNewer } = get()
    if (!channelId || !postId || isLoading || messages.length === 0 || !hasNewer) return
    const newestMsg = messages[messages.length - 1]
    set({ isLoading: true })
    try {
      const result = await api.getThreadMessages(channelId, postId, { after: newestMsg.id })
      set((s) => {
        const next = [...s.messages]
        for (const msg of result.messages) {
          if (!next.some((m) => m.id === msg.id)) next.push(msg)
        }
        return { messages: next, hasNewer: !!result.hasNewer, isLoading: false }
      })
    } catch {
      set({ isLoading: false })
    }
  },

  reconcileToLatest: async () => {
    const { channelId, postId, messages, hasNewer } = get()
    if (!channelId || !postId || messages.length === 0 || !hasNewer) return
    set({ isLoading: true })
    try {
      const nextMessages = [...messages]
      let nextHasNewer: boolean = hasNewer
      let cursor = nextMessages[nextMessages.length - 1]?.id
      while (nextHasNewer && cursor) {
        const result = await api.getThreadMessages(channelId, postId, { after: cursor })
        for (const msg of result.messages) {
          if (!nextMessages.some((m) => m.id === msg.id)) nextMessages.push(msg)
        }
        nextHasNewer = !!result.hasNewer
        cursor = nextMessages[nextMessages.length - 1]?.id
      }
      set({
        messages: nextMessages,
        hasNewer: nextHasNewer,
        isLoading: false,
        focusMessageId: null
      })
    } catch {
      set({ isLoading: false })
    }
  },

  clearMessages: () => set({ messages: [], hasMore: false, hasNewer: false }),

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

  updateMessage: (msg) => {
    set((s) => ({
      messages: s.messages.map((m) => (m.id === msg.id ? msg : m))
    }))
  },

  removeMessage: (msgId) => {
    set((s) => ({
      messages: s.messages.filter((m) => m.id !== msgId)
    }))
  }
}))
