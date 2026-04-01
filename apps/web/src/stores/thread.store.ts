import type { Message } from '@chat/shared'
import { create } from 'zustand'
import { api } from '@/lib/api'

interface ThreadState {
  isOpen: boolean
  parentMessage: Message | null
  channelId: string | null
  messages: Message[]
  isLoading: boolean
  hasMore: boolean
  hasNewer: boolean
  focusMessageId: string | null
  scrollToMessageId: string | null
  scrollRequestNonce: number
  loadedForParentId: string | null

  openThread: (channelId: string, parentMessage: Message, opts?: { focusMessageId?: string }) => void
  closeThread: () => void
  fetchMessages: () => Promise<void>
  fetchMore: () => Promise<void>
  fetchNewer: () => Promise<void>
  reconcileToLatest: () => Promise<void>
  setScrollToMessageId: (id: string | null) => void
  addMessage: (message: Message) => void
  updateMessage: (message: Message) => void
  deleteMessage: (messageId: string) => void
}

export const useThreadStore = create<ThreadState>((set, get) => ({
  isOpen: false,
  parentMessage: null,
  channelId: null,
  messages: [],
  isLoading: false,
  hasMore: false,
  hasNewer: false,
  focusMessageId: null,
  scrollToMessageId: null,
  scrollRequestNonce: 0,
  loadedForParentId: null,

  openThread: (channelId, parentMessage, opts) => {
    const current = get()
    if (current.isOpen && current.parentMessage?.id === parentMessage.id) {
      if (opts?.focusMessageId) {
        set({
          scrollToMessageId: opts.focusMessageId,
          scrollRequestNonce: current.scrollRequestNonce + 1,
          focusMessageId: opts.focusMessageId
        })
      }
      return
    }
    set({
      isOpen: true,
      parentMessage,
      channelId,
      messages: [],
      isLoading: true,
      hasMore: false,
      hasNewer: false,
      focusMessageId: opts?.focusMessageId ?? null,
      scrollToMessageId: opts?.focusMessageId ?? null,
      scrollRequestNonce: current.scrollRequestNonce + 1,
      loadedForParentId: null
    })
  },

  closeThread: () => {
    set({
      isOpen: false,
      parentMessage: null,
      channelId: null,
      messages: [],
      hasMore: false,
      hasNewer: false,
      focusMessageId: null,
      scrollToMessageId: null,
      loadedForParentId: null
    })
  },

  fetchMessages: async () => {
    const { channelId, parentMessage, focusMessageId } = get()
    if (!channelId || !parentMessage) return

    set({ isLoading: true })
    try {
      const result = await api.getThreadMessages(
        channelId,
        parentMessage.id,
        focusMessageId ? { around: focusMessageId } : undefined
      )
      set({
        messages: result.messages,
        hasMore: result.hasMore,
        hasNewer: !!result.hasNewer,
        isLoading: false,
        loadedForParentId: parentMessage.id
      })
    } catch {
      set({ isLoading: false })
    }
  },

  fetchMore: async () => {
    const { channelId, parentMessage, messages, isLoading } = get()
    if (!channelId || !parentMessage || isLoading || messages.length === 0) return

    const oldestMsg = messages[0]
    set({ isLoading: true })
    try {
      const result = await api.getThreadMessages(channelId, parentMessage.id, { cursor: oldestMsg.id })
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
    const { channelId, parentMessage, messages, isLoading, hasNewer } = get()
    if (!channelId || !parentMessage || isLoading || messages.length === 0 || !hasNewer) return

    const newestMsg = messages[messages.length - 1]
    set({ isLoading: true })
    try {
      const result = await api.getThreadMessages(channelId, parentMessage.id, { after: newestMsg.id })
      set((s) => {
        const next = [...s.messages]
        for (const msg of result.messages) {
          if (!next.some((m) => m.id === msg.id)) next.push(msg)
        }
        return {
          messages: next,
          hasNewer: !!result.hasNewer,
          isLoading: false
        }
      })
    } catch {
      set({ isLoading: false })
    }
  },

  reconcileToLatest: async () => {
    const { channelId, parentMessage, messages, hasNewer } = get()
    if (!channelId || !parentMessage || messages.length === 0 || !hasNewer) return

    set({ isLoading: true })
    try {
      const nextMessages = [...messages]
      let nextHasNewer: boolean = hasNewer
      let cursor = nextMessages[nextMessages.length - 1]?.id
      while (nextHasNewer && cursor) {
        const result = await api.getThreadMessages(channelId, parentMessage.id, { after: cursor })
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

  setScrollToMessageId: (id) =>
    set((s) => ({
      scrollToMessageId: id,
      scrollRequestNonce: id !== null ? s.scrollRequestNonce + 1 : s.scrollRequestNonce
    })),

  addMessage: (message) => {
    const { parentMessage } = get()
    if (!parentMessage || message.threadParentId !== parentMessage.id) return
    set((s) => {
      if (s.hasNewer) return s
      if (s.messages.some((m) => m.id === message.id)) return s
      return { messages: [...s.messages, message] }
    })
  },

  updateMessage: (message) => {
    set((s) => ({
      messages: s.messages.map((m) => (m.id === message.id ? message : m))
    }))
  },

  deleteMessage: (messageId) => {
    set((s) => ({
      messages: s.messages.filter((m) => m.id !== messageId)
    }))
  }
}))
