import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { useShallow } from 'zustand/react/shallow'

/** Native (unicode) emojis seeded until the user builds their own history. */
const DEFAULT_RECENT = ['👍', '❤️', '😂', '😮']
const MAX_STORED = 20
/** How many recent reactions the hover toolbar shows. */
export const RECENT_SHOWN = 4

type ReactionsState = {
  recent: string[]
  /** Record a native emoji as recently used (most-recent-first, deduped, capped). */
  addRecent: (emoji: string) => void
}

export const useReactionsStore = create<ReactionsState>()(
  persist(
    (set) => ({
      recent: DEFAULT_RECENT,
      addRecent: (emoji) => {
        const trimmed = emoji.trim()
        if (!trimmed) return
        set((s) => {
          const next = [trimmed, ...s.recent.filter((e) => e !== trimmed)].slice(0, MAX_STORED)
          return { recent: next }
        })
      }
    }),
    {
      name: 'jablu-reactions',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ recent: s.recent })
    }
  )
)

/**
 * Top recent native reaction emojis for the hover quick-row. Uses a shallow
 * selector so the sliced array keeps a stable reference across renders (a fresh
 * array each render would break useSyncExternalStore and loop).
 */
export function useRecentReactions(): string[] {
  return useReactionsStore(useShallow((s) => s.recent.slice(0, RECENT_SHOWN)))
}

/** Non-hook accessor for recording a reaction from callbacks. */
export function addRecentReaction(emoji: string): void {
  useReactionsStore.getState().addRecent(emoji)
}
