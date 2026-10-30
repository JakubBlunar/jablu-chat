import { addMessageReaction, removeMessageReaction, replaceMessageInList, removeMessageFromList, messageListPatch, updateMessageInList } from '@/lib/messageCollection'
import type { LinkPreview, Message, Poll } from '@chat/shared'
import { create } from 'zustand'
import { api } from '@/lib/api'
import { CACHE_PAGE_SIZE, channelKey, evictContext, getContext, putContext } from '@/lib/cache/messageCache'
import { isForbidden } from '@/lib/cache/isForbidden'
import { requireMessageTarget, historyErrorKey } from '@/lib/messageHistory'
import { evictServer as evictServerStructure } from '@/lib/cache/structureCache'
import { mergeNewestPage, toChronological, trimOldest, trimNewest } from '@/lib/message-pagination'
import { useChannelPermissionsStore } from './channel-permissions.store'
import { useChannelStore } from './channel.store'

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
  fetchMessages: (channelId: string, cursor?: string, signal?: AbortSignal) => Promise<void>
  fetchMessagesAround: (channelId: string, messageId: string, signal?: AbortSignal) => Promise<void>
  fetchNewerMessages: (channelId: string) => Promise<void>
  addMessage: (message: Message) => void
  updateMessage: (message: Message) => void
  removeMessage: (messageId: string) => void
  clearMessages: () => void
  cancelPendingFetch: () => void
  stashCurrent: () => void
  hydrateFromCache: (channelId: string) => boolean
  revalidate: (channelId: string) => Promise<void>
  addReaction: (messageId: string, emoji: string, userId: string, isCustom?: boolean) => void
  removeReaction: (messageId: string, emoji: string, userId: string) => void
  setLinkPreviews: (messageId: string, linkPreviews: LinkPreview[]) => void
  updatePoll: (poll: Poll) => void
  updateThreadCount: (messageId: string, threadCount: number, lastThreadReply?: Message['lastThreadReply']) => void
  setScrollToMessageId: (id: string | null) => void
  setTypingUser: (channelId: string, userId: string, username: string) => void
  removeTypingUser: (userId: string) => void
}

let _msgFetchId = 0

function clearTypingTimers(typingUsers: Map<string, TypingEntry>) {
  for (const entry of typingUsers.values()) clearTimeout(entry.timeout)
}

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

  fetchMessages: async (channelId, cursor, signal) => {
    const fetchId = ++_msgFetchId
    set({ isLoading: true, messagesError: null })
    try {
      const params = new URLSearchParams()
      if (cursor) params.set('cursor', cursor)
      params.set('limit', '50')
      const qs = params.toString()
      const path = `/api/channels/${channelId}/messages${qs ? `?${qs}` : ''}`
      const page = await (signal ? api.get<MessagesPage>(path, { signal }) : api.get<MessagesPage>(path))
      if (_msgFetchId !== fetchId) return
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
        putContext(channelKey(channelId), {
          messages: chronological,
          hasMore: page.hasMore,
          hasNewer: false
        })
      }
    } catch (e) {
      if (_msgFetchId !== fetchId) return
      set({ isLoading: false, messagesError: 'Failed to load messages' })
      throw e
    }
  },

  fetchMessagesAround: async (channelId, messageId, signal) => {
    const fetchId = ++_msgFetchId
    set({ isLoading: true, messagesError: null })
    try {
      const path = `/api/channels/${channelId}/messages?around=${messageId}&limit=100`
      const page = await (signal ? api.get<MessagesPage>(path, { signal }) : api.get<MessagesPage>(path))
      if (_msgFetchId !== fetchId) return
      requireMessageTarget(page.messages, messageId)
      const chronological = toChronological(page.messages)
      if (get().loadedForChannelId !== channelId) clearTypingTimers(get().typingUsers)
      set({
        messages: chronological,
        hasMore: page.hasMore,
        hasNewer: page.hasNewer ?? false,
        isLoading: false,
        loadedForChannelId: channelId,
        typingUsers: get().loadedForChannelId === channelId ? get().typingUsers : new Map()
      })
    } catch (e) {
      if (_msgFetchId !== fetchId) return
      set({ isLoading: false, messagesError: historyErrorKey(e) })
      throw e
    }
  },

  fetchNewerMessages: async (channelId) => {
    const { messages } = get()
    if (!messages.length) return
    const newestId = messages[messages.length - 1].id
    const fetchId = ++_msgFetchId
    set({ isLoading: true, messagesError: null })
    try {
      const path = `/api/channels/${channelId}/messages?after=${newestId}&limit=50`
      const page = await api.get<MessagesPage>(path)
      if (_msgFetchId !== fetchId) return
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
      if (_msgFetchId !== fetchId) return
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

  updateMessage: (message) => set((s) => messageListPatch(s, replaceMessageInList(s.messages, message))),

  removeMessage: (messageId) => set((s) => messageListPatch(s, removeMessageFromList(s.messages, messageId))),

  cancelPendingFetch: () => {
    ++_msgFetchId
    set({ isLoading: false })
  },

  clearMessages: () => {
    ++_msgFetchId
    clearTypingTimers(get().typingUsers)
    set({
      messages: [],
      isLoading: false,
      hasMore: false,
      hasNewer: false,
      messagesError: null,
      loadedForChannelId: null,
      scrollToMessageId: null,
      typingUsers: new Map()
    })
  },

  stashCurrent: () => {
    const { loadedForChannelId, messages, hasMore, hasNewer, isLoading } = get()
    if (!loadedForChannelId || isLoading) return

    // Only the live edge is worth keeping. Caching a view scrolled into
    // history would drop the user back into the middle of the channel on
    // return, and `addMessage` refuses to append while `hasNewer` is set.
    if (hasNewer) {
      evictContext(channelKey(loadedForChannelId))
      return
    }

    putContext(channelKey(loadedForChannelId), { messages, hasMore, hasNewer: false })
  },

  hydrateFromCache: (channelId) => {
    const entry = getContext(channelKey(channelId))
    if (!entry) return false

    ++_msgFetchId
    clearTypingTimers(get().typingUsers)
    // `loadedForChannelId` has to land in the same update as `messages`:
    // useMessageScroll reads it to decide whether to keep what is on screen or
    // clear and refetch, and a mismatch there silently discards the cache.
    set({
      messages: entry.messages,
      hasMore: entry.hasMore,
      hasNewer: entry.hasNewer,
      isLoading: false,
      messagesError: null,
      loadedForChannelId: channelId,
      scrollToMessageId: null,
      typingUsers: new Map()
    })
    return true
  },

  /**
   * Check a cache-served channel against the server without disturbing the
   * view. Corrects edits and deletions that happened while the app was closed,
   * which no socket event can tell us about after the fact.
   */
  revalidate: async (channelId) => {
    if (get().isLoading) return
    const fetchId = ++_msgFetchId
    const idsWhenRequested = new Set(get().messages.map((m) => m.id))
    try {
      const page = await api.get<MessagesPage>(`/api/channels/${channelId}/messages?limit=50`)

      // Anything that started a fetch since then is more current than we are.
      if (_msgFetchId !== fetchId) return
      if (get().loadedForChannelId !== channelId) return

      const state = get()
      // Scrollback loaded in the meantime reaches further back than this page
      // can justify replacing, and the user is reading it right now.
      if (state.messages.length > CACHE_PAGE_SIZE || state.hasNewer) return

      const merged = mergeNewestPage(state.messages, toChronological(page.messages), idsWhenRequested)
      set({ messages: merged, hasMore: page.hasMore, messagesError: null })
      putContext(channelKey(channelId), { messages: merged, hasMore: page.hasMore, hasNewer: false })
    } catch (e) {
      // Access can be revoked while the app is closed, in which case the
      // cached copy is not just stale but forbidden. The sidebar is cached
      // too and will be showing a channel that is no longer there.
      if (!isForbidden(e)) return
      evictContext(channelKey(channelId))
      const { loadedServerId, fetchChannels } = useChannelStore.getState()
      if (loadedServerId) {
        evictServerStructure(loadedServerId)
        void fetchChannels(loadedServerId, true).catch(() => {})
        void useChannelPermissionsStore.getState().fetchChannelPermissions(loadedServerId, true)
      }
    }
  },

  addReaction: (messageId, emoji, userId, isCustom) => set((s) => messageListPatch(s, addMessageReaction(s.messages, messageId, emoji, userId, isCustom))),

  removeReaction: (messageId, emoji, userId) => set((s) => messageListPatch(s, removeMessageReaction(s.messages, messageId, emoji, userId))),

  setScrollToMessageId: (id) =>
    set((s) => ({
      scrollToMessageId: id,
      scrollRequestNonce: id !== null ? s.scrollRequestNonce + 1 : s.scrollRequestNonce
    })),

  setLinkPreviews: (messageId, linkPreviews) => {
    set((s) => messageListPatch(s, updateMessageInList(s.messages, messageId, (m) => m.linkPreviews === linkPreviews ? m : { ...m, linkPreviews })))
  },

  updatePoll: (poll) => {
    set((s) => messageListPatch(s, updateMessageInList(s.messages, poll.messageId, (m) => m.poll === poll ? m : { ...m, poll })))
  },

  updateThreadCount: (messageId, threadCount, lastThreadReply) => {
    set((s) => messageListPatch(s, updateMessageInList(s.messages, messageId, (m) =>
      m.threadCount === threadCount && (lastThreadReply === undefined || m.lastThreadReply === lastThreadReply)
        ? m : { ...m, threadCount, ...(lastThreadReply !== undefined ? { lastThreadReply } : {}) }
    )))
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
