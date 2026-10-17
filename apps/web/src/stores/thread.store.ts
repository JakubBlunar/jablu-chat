import type { Message } from '@chat/shared'
import { create } from 'zustand'
import { api } from '@/lib/api'
import { historyErrorKey, requireMessageTarget } from '@/lib/messageHistory'

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
  messagesError: string | null

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
  addReaction: (messageId: string, emoji: string, userId: string, isCustom?: boolean) => void
  removeReaction: (messageId: string, emoji: string, userId: string) => void
}

let requestId = 0

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
  messagesError: null,

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
    ++requestId
    set({
      isOpen: true,
      parentMessage,
      channelId,
      messages: [],
      isLoading: false,
      messagesError: null,
      hasMore: false,
      hasNewer: false,
      focusMessageId: opts?.focusMessageId ?? null,
      scrollToMessageId: opts?.focusMessageId ?? null,
      scrollRequestNonce: current.scrollRequestNonce + 1,
      loadedForParentId: null
    })
  },

  closeThread: () => {
    ++requestId
    set({
      isOpen: false,
      parentMessage: null,
      channelId: null,
      messages: [],
      isLoading: false,
      messagesError: null,
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

    const fetchId = ++requestId
    set({ isLoading: true, messagesError: null })
    try {
      const result = await api.getThreadMessages(
        channelId,
        parentMessage.id,
        focusMessageId ? { around: focusMessageId } : undefined
      )
      if (fetchId !== requestId) return
      if (focusMessageId) requireMessageTarget(result.messages, focusMessageId)
      set({
        messages: result.messages,
        hasMore: result.hasMore,
        hasNewer: !!result.hasNewer,
        isLoading: false,
        loadedForParentId: parentMessage.id
      })
    } catch (error) {
      if (fetchId !== requestId) return
      console.error('Failed to load thread messages', error)
      set({ isLoading: false, messagesError: historyErrorKey(error) })
    }
  },

  fetchMore: async () => {
    const { channelId, parentMessage, messages, isLoading } = get()
    if (!channelId || !parentMessage || isLoading || messages.length === 0) return

    const oldestMsg = messages[0]
    const fetchId = ++requestId
    set({ isLoading: true, messagesError: null })
    try {
      const result = await api.getThreadMessages(channelId, parentMessage.id, { cursor: oldestMsg.id })
      if (fetchId !== requestId) return
      set((s) => ({
        messages: [...result.messages, ...s.messages],
        hasMore: result.hasMore,
        isLoading: false
      }))
    } catch (error) {
      if (fetchId !== requestId) return
      console.error('Failed to load older thread messages', error)
      set({ isLoading: false, messagesError: historyErrorKey(error) })
    }
  },

  fetchNewer: async () => {
    const { channelId, parentMessage, messages, isLoading, hasNewer } = get()
    if (!channelId || !parentMessage || isLoading || messages.length === 0 || !hasNewer) return

    const newestMsg = messages[messages.length - 1]
    const fetchId = ++requestId
    set({ isLoading: true, messagesError: null })
    try {
      const result = await api.getThreadMessages(channelId, parentMessage.id, { after: newestMsg.id })
      if (fetchId !== requestId) return
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
    } catch (error) {
      if (fetchId !== requestId) return
      console.error('Failed to load newer thread messages', error)
      set({ isLoading: false, messagesError: historyErrorKey(error) })
    }
  },

  reconcileToLatest: async () => {
    const { channelId, parentMessage, messages, hasNewer } = get()
    if (!channelId || !parentMessage || messages.length === 0 || !hasNewer) return

    const fetchId = ++requestId
    set({ isLoading: true, messagesError: null })
    try {
      const nextMessages = [...messages]
      let nextHasNewer: boolean = hasNewer
      let cursor = nextMessages[nextMessages.length - 1]?.id
      while (nextHasNewer && cursor) {
        const result = await api.getThreadMessages(channelId, parentMessage.id, { after: cursor })
        if (fetchId !== requestId) return
        for (const msg of result.messages) {
          if (!nextMessages.some((m) => m.id === msg.id)) nextMessages.push(msg)
        }
        nextHasNewer = !!result.hasNewer
        const nextCursor = nextMessages[nextMessages.length - 1]?.id
        if (nextHasNewer && nextCursor === cursor) throw new Error('Thread history did not advance')
        cursor = nextCursor
      }
      set({
        messages: nextMessages,
        hasNewer: nextHasNewer,
        isLoading: false,
        focusMessageId: null
      })
    } catch (error) {
      if (fetchId !== requestId) return
      console.error('Failed to load latest thread messages', error)
      set({ isLoading: false, messagesError: historyErrorKey(error) })
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
  },

  addReaction: (messageId, emoji, userId, isCustom) => {
    set((s) => {
      if (!s.messages.some((m) => m.id === messageId)) return s
      return {
        messages: s.messages.map((m) => {
          if (m.id !== messageId) return m
          const reactions = [...(m.reactions ?? [])]
          const existing = reactions.find((r) => r.emoji === emoji)
          if (existing) {
            if (!existing.userIds.includes(userId)) {
              return {
                ...m,
                reactions: reactions.map((r) =>
                  r.emoji === emoji ? { ...r, count: r.count + 1, userIds: [...r.userIds, userId] } : r
                )
              }
            }
            return m
          }
          return {
            ...m,
            reactions: [...reactions, { emoji, count: 1, userIds: [userId], isCustom: isCustom ?? false }]
          }
        })
      }
    })
  },

  removeReaction: (messageId, emoji, userId) => {
    set((s) => {
      if (!s.messages.some((m) => m.id === messageId)) return s
      return {
        messages: s.messages.map((m) => {
          if (m.id !== messageId) return m
          const reactions = (m.reactions ?? [])
            .map((r) => {
              if (r.emoji !== emoji) return r
              const uids = r.userIds.filter((id) => id !== userId)
              return { ...r, count: uids.length, userIds: uids }
            })
            .filter((r) => r.count > 0)
          return { ...m, reactions }
        })
      }
    })
  }
}))
