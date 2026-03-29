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

  openThread: (channelId: string, parentMessage: Message) => void
  closeThread: () => void
  fetchMessages: () => Promise<void>
  fetchMore: () => Promise<void>
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

  openThread: (channelId, parentMessage) => {
    set({
      isOpen: true,
      parentMessage,
      channelId,
      messages: [],
      isLoading: true,
      hasMore: false
    })
    get().fetchMessages()
  },

  closeThread: () => {
    set({
      isOpen: false,
      parentMessage: null,
      channelId: null,
      messages: [],
      hasMore: false
    })
  },

  fetchMessages: async () => {
    const { channelId, parentMessage } = get()
    if (!channelId || !parentMessage) return

    set({ isLoading: true })
    try {
      const result = await api.getThreadMessages(channelId, parentMessage.id)
      set({ messages: result.messages, hasMore: result.hasMore, isLoading: false })
    } catch {
      set({ isLoading: false })
    }
  },

  fetchMore: async () => {
    const { channelId, parentMessage, messages, isLoading } = get()
    if (!channelId || !parentMessage || isLoading || messages.length === 0) return

    const lastMsg = messages[messages.length - 1]
    set({ isLoading: true })
    try {
      const result = await api.getThreadMessages(channelId, parentMessage.id, lastMsg.id)
      set((s) => ({
        messages: [...s.messages, ...result.messages],
        hasMore: result.hasMore,
        isLoading: false
      }))
    } catch {
      set({ isLoading: false })
    }
  },

  addMessage: (message) => {
    const { parentMessage } = get()
    if (!parentMessage || message.threadParentId !== parentMessage.id) return
    set((s) => {
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
