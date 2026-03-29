import type { LinkPreview, Message, Poll } from '@chat/shared'
import { create } from 'zustand'
import { api } from '@/lib/api'
import { toChronological, trimOldest, trimNewest } from '@/lib/message-pagination'

type TypingEntry = {
  username: string
  timeout: ReturnType<typeof setTimeout>
}

type MessagesPage = {
  messages: Message[]
  hasMore: boolean
  hasNewer?: boolean
}

type MessageState = {
  messages: Message[]
  isLoading: boolean
  hasMore: boolean
  hasNewer: boolean
  messagesError: string | null
  loadedForChannelId: string | null
  typingUsers: Map<string, TypingEntry>
  scrollToMessageId: string | null
  scrollRequestNonce: number
  fetchMessages: (channelId: string, cursor?: string) => Promise<void>
  fetchMessagesAround: (channelId: string, messageId: string) => Promise<void>
  fetchNewerMessages: (channelId: string) => Promise<void>
  addMessage: (message: Message) => void
  updateMessage: (message: Message) => void
  removeMessage: (messageId: string) => void
  clearMessages: () => void
  addReaction: (messageId: string, emoji: string, userId: string) => void
  removeReaction: (messageId: string, emoji: string, userId: string) => void
  setLinkPreviews: (messageId: string, linkPreviews: LinkPreview[]) => void
  updatePoll: (poll: Poll) => void
  updateThreadCount: (messageId: string, threadCount: number) => void
  setScrollToMessageId: (id: string | null) => void
  setTypingUser: (channelId: string, userId: string, username: string) => void
  removeTypingUser: (userId: string) => void
}

let _msgFetchId = 0

export const useMessageStore = create<MessageState>((set, get) => ({
  messages: [],
  isLoading: false,
  hasMore: false,
  hasNewer: false,
  messagesError: null,
  loadedForChannelId: null,
  typingUsers: new Map(),
  scrollToMessageId: null,
  scrollRequestNonce: 0,

  fetchMessages: async (channelId, cursor) => {
    const fetchId = ++_msgFetchId
    set({ isLoading: true, messagesError: null })
    try {
      const params = new URLSearchParams()
      if (cursor) params.set('cursor', cursor)
      params.set('limit', '50')
      const qs = params.toString()
      const path = `/api/channels/${channelId}/messages${qs ? `?${qs}` : ''}`
      const page = await api.get<MessagesPage>(path)
      if (_msgFetchId !== fetchId) {
        set({ isLoading: false })
        return
      }
      const chronological = toChronological(page.messages)

      if (cursor) {
        set((s) => {
          const merged = [...chronological, ...s.messages]
          const trimmed = trimNewest(merged)
          return {
            messages: trimmed,
            hasMore: page.hasMore,
            hasNewer: trimmed.length < merged.length ? true : s.hasNewer,
            isLoading: false
          }
        })
      } else {
        set({
          messages: chronological,
          hasMore: page.hasMore,
          hasNewer: false,
          isLoading: false,
          loadedForChannelId: channelId
        })
      }
    } catch (e) {
      set({ isLoading: false, messagesError: 'Failed to load messages' })
      throw e
    }
  },

  fetchMessagesAround: async (channelId, messageId) => {
    const fetchId = ++_msgFetchId
    set({ isLoading: true, messagesError: null })
    try {
      const path = `/api/channels/${channelId}/messages?around=${messageId}&limit=100`
      const page = await api.get<MessagesPage>(path)
      if (_msgFetchId !== fetchId) {
        set({ isLoading: false })
        return
      }
      const chronological = toChronological(page.messages)
      set({
        messages: chronological,
        hasMore: page.hasMore,
        hasNewer: page.hasNewer ?? false,
        isLoading: false,
        loadedForChannelId: channelId
      })
    } catch (e) {
      set({ isLoading: false, messagesError: 'Failed to load messages' })
      throw e
    }
  },

  fetchNewerMessages: async (channelId) => {
    const { messages } = get()
    if (!messages.length) return
    const newestId = messages[messages.length - 1].id
    set({ isLoading: true })
    try {
      const path = `/api/channels/${channelId}/messages?after=${newestId}&limit=50`
      const page = await api.get<MessagesPage>(path)
      if (get().loadedForChannelId !== channelId) {
        set({ isLoading: false })
        return
      }
      const chronological = toChronological(page.messages)
      set((s) => {
        const merged = [...s.messages, ...chronological]
        const trimmed = trimOldest(merged)
        return {
          messages: trimmed,
          hasMore: trimmed.length < merged.length ? true : s.hasMore,
          hasNewer: page.hasNewer ?? false,
          isLoading: false
        }
      })
    } catch (e) {
      set({ isLoading: false, messagesError: 'Failed to load messages' })
      throw e
    }
  },

  addMessage: (message) => {
    set((s) => {
      if (s.hasNewer) return s
      if (s.messages.some((m) => m.id === message.id)) return s
      const merged = [...s.messages, message]
      const trimmed = trimOldest(merged)
      return {
        messages: trimmed,
        hasMore: trimmed.length < merged.length ? true : s.hasMore
      }
    })
  },

  updateMessage: (message) => {
    set((s) => ({
      messages: s.messages.map((m) => (m.id === message.id ? message : m))
    }))
  },

  removeMessage: (messageId) => {
    set((s) => ({
      messages: s.messages.filter((m) => m.id !== messageId)
    }))
  },

  clearMessages: () => {
    const { typingUsers } = get()
    for (const entry of typingUsers.values()) {
      clearTimeout(entry.timeout)
    }
    set({
      messages: [],
      hasMore: false,
      hasNewer: false,
      messagesError: null,
      loadedForChannelId: null,
      typingUsers: new Map()
    })
  },

  addReaction: (messageId, emoji, userId) => {
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
            reactions: [...reactions, { emoji, count: 1, userIds: [userId], isCustom: false }]
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
  },

  setScrollToMessageId: (id) =>
    set((s) => ({
      scrollToMessageId: id,
      scrollRequestNonce: id !== null ? s.scrollRequestNonce + 1 : s.scrollRequestNonce
    })),

  setLinkPreviews: (messageId, linkPreviews) => {
    set((s) => ({
      messages: s.messages.map((m) => (m.id === messageId ? { ...m, linkPreviews } : m))
    }))
  },

  updatePoll: (poll) => {
    set((s) => ({
      messages: s.messages.map((m) => (m.id === poll.messageId ? { ...m, poll } : m))
    }))
  },

  updateThreadCount: (messageId, threadCount) => {
    set((s) => ({
      messages: s.messages.map((m) => (m.id === messageId ? { ...m, threadCount } : m))
    }))
  },

  setTypingUser: (_channelId, userId, username) => {
    set((s) => {
      const next = new Map(s.typingUsers)
      const existing = next.get(userId)
      if (existing) clearTimeout(existing.timeout)
      const timeout = setTimeout(() => {
        get().removeTypingUser(userId)
      }, 3000)
      next.set(userId, { username, timeout })
      return { typingUsers: next }
    })
  },

  removeTypingUser: (userId) => {
    set((s) => {
      const next = new Map(s.typingUsers)
      const entry = next.get(userId)
      if (entry) clearTimeout(entry.timeout)
      next.delete(userId)
      return { typingUsers: next }
    })
  }
}))
