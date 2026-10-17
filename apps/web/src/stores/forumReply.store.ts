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

  fetchMessages: () => Promise<void>
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

  fetchMessages: async () => {
    const { channelId, postId, focusMessageId } = get()
    if (!channelId || !postId) return
    const fetchId = ++requestId
    set({ isLoading: true, messagesError: null })
    try {
      const result = await api.getThreadMessages(
        channelId,
        postId,
        focusMessageId ? { around: focusMessageId } : undefined
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

  updateMessage: (msg) => {
    set((s) => ({
      messages: s.messages.map((m) => (m.id === msg.id ? msg : m))
    }))
  },

  removeMessage: (msgId) => {
    set((s) => ({
      messages: s.messages.filter((m) => m.id !== msgId)
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
