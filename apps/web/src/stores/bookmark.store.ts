import { create } from 'zustand'
import { api } from '@/lib/api'

type BookmarkState = {
  bookmarkedIds: Set<string>
  loaded: boolean
  fetchIds: () => Promise<void>
  toggleBookmark: (messageId: string) => Promise<void>
  removeBookmark: (messageId: string) => Promise<void>
  isBookmarked: (messageId: string) => boolean
  clearForServer: (serverChannelIds: string[], messages: { id: string; channelId?: string | null }[]) => void
}

export const useBookmarkStore = create<BookmarkState>((set, get) => ({
  bookmarkedIds: new Set(),
  loaded: false,

  fetchIds: async () => {
    try {
      const ids = await api.getBookmarkIds()
      set({ bookmarkedIds: new Set(ids), loaded: true })
    } catch {
      set({ loaded: true })
    }
  },

  toggleBookmark: async (messageId) => {
    const result = await api.toggleBookmark(messageId)
    set((s) => {
      const next = new Set(s.bookmarkedIds)
      if (result.action === 'added') {
        next.add(messageId)
      } else {
        next.delete(messageId)
      }
      return { bookmarkedIds: next }
    })
  },

  removeBookmark: async (messageId) => {
    await api.removeBookmark(messageId)
    set((s) => {
      const next = new Set(s.bookmarkedIds)
      next.delete(messageId)
      return { bookmarkedIds: next }
    })
  },

  isBookmarked: (messageId) => get().bookmarkedIds.has(messageId),

  clearForServer: (_serverChannelIds, _messages) => {
    // Called when user leaves/is kicked from a server; re-fetch IDs for accuracy
    get().fetchIds()
  }
}))
