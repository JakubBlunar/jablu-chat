import { create } from 'zustand'
import { api } from '@/lib/api'
import type { InAppNotificationDto } from '@/lib/api/types'

type State = {
  unreadCount: number
  items: InAppNotificationDto[]
  nextCursor: string | undefined
  loading: boolean
  listLoading: boolean
  fetchUnread: () => Promise<void>
  fetchList: (opts?: { append?: boolean }) => Promise<void>
  markRead: (id: string) => Promise<void>
  markAllRead: () => Promise<void>
  applySocketBump: () => void
}

export const useNotificationCenterStore = create<State>((set, get) => ({
  unreadCount: 0,
  items: [],
  nextCursor: undefined,
  loading: false,
  listLoading: false,

  fetchUnread: async () => {
    set({ loading: true })
    try {
      const { count } = await api.getInAppNotificationUnreadCount()
      set({ unreadCount: count })
    } catch {
      /* ignore */
    } finally {
      set({ loading: false })
    }
  },

  fetchList: async (opts) => {
    const append = opts?.append ?? false
    set({ listLoading: true })
    try {
      const cursor = append ? get().nextCursor : undefined
      const { items, nextCursor } = await api.getInAppNotifications({
        limit: 30,
        ...(cursor ? { cursor } : {})
      })
      set({
        items: append ? [...get().items, ...items] : items,
        nextCursor
      })
      await get().fetchUnread()
    } catch {
      if (!append) set({ items: [] })
    } finally {
      set({ listLoading: false })
    }
  },

  markRead: async (id: string) => {
    const wasUnread = get().items.some((it) => it.id === id && !it.readAt)
    try {
      await api.markInAppNotificationRead(id)
      set((s) => ({
        items: s.items.map((it) => (it.id === id ? { ...it, readAt: new Date().toISOString() } : it)),
        unreadCount: wasUnread ? Math.max(0, s.unreadCount - 1) : s.unreadCount
      }))
    } catch {
      await get().fetchUnread()
      await get().fetchList()
    }
  },

  markAllRead: async () => {
    try {
      await api.markAllInAppNotificationsRead()
      set((s) => ({
        unreadCount: 0,
        items: s.items.map((it) => ({ ...it, readAt: it.readAt ?? new Date().toISOString() }))
      }))
    } catch {
      await get().fetchUnread()
    }
  },

  applySocketBump: () => {
    void get().fetchUnread()
  }
}))
