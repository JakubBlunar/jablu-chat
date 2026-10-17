import { create } from 'zustand'
import { api } from '@/lib/api'
import type { InAppNotificationDto } from '@/lib/api/types'

type State = {
  unreadCount: number
  items: InAppNotificationDto[]
  nextCursor: string | undefined
  loading: boolean
  listLoading: boolean
  listError: 'initial' | 'append' | null
  unreadError: boolean
  actionError: boolean
  failedAction: string | null
  retryAction: () => Promise<void>
  pendingIds: string[]
  markAllPending: boolean
  fetchUnread: () => Promise<void>
  fetchList: (opts?: { append?: boolean }) => Promise<void>
  markRead: (id: string) => Promise<void>
  markAllRead: () => Promise<void>
  applySocketBump: () => void
  /** Set by the bell so socket bumps know whether the list is on screen. */
  setPanelOpen: (open: boolean) => void
  panelOpen: boolean
}

export const useNotificationCenterStore = create<State>((set, get) => ({
  unreadCount: 0,
  items: [],
  nextCursor: undefined,
  loading: false,
  listLoading: false,
  listError: null,
  unreadError: false,
  actionError: false,
  failedAction: null,
  retryAction: async () => {
    const failed = get().failedAction
    if (failed === 'all') await get().markAllRead()
    else if (failed) await get().markRead(failed)
  },
  pendingIds: [],
  markAllPending: false,

  fetchUnread: async () => {
    set({ loading: true })
    try {
      const { count } = await api.getInAppNotificationUnreadCount()
      set({ unreadCount: count, unreadError: false })
    } catch (error) {
      console.error('Failed to refresh notification count', error)
      set({ unreadError: true })
    } finally {
      set({ loading: false })
    }
  },

  fetchList: async (opts) => {
    if (get().listLoading) return
    const append = opts?.append ?? false
    set({ listLoading: true, listError: null })
    try {
      const cursor = append ? get().nextCursor : undefined
      const { items, nextCursor } = await api.getInAppNotifications({
        limit: 30,
        ...(cursor ? { cursor } : {})
      })
      set({
        items: append
          ? [...get().items, ...items.filter((item) => !get().items.some((old) => old.id === item.id))]
          : items,
        nextCursor
      })
      await get().fetchUnread()
    } catch (error) {
      console.error('Failed to load notifications', error)
      set({ listError: append ? 'append' : 'initial' })
    } finally {
      set({ listLoading: false })
    }
  },

  markRead: async (id: string) => {
    if (get().pendingIds.includes(id) || get().markAllPending) return
    set((s) => ({ pendingIds: [...s.pendingIds, id], actionError: false, failedAction: null }))
    const wasUnread = get().items.some((it) => it.id === id && !it.readAt)
    try {
      await api.markInAppNotificationRead(id)
      set((s) => ({
        items: s.items.map((it) => (it.id === id ? { ...it, readAt: new Date().toISOString() } : it)),
        unreadCount: wasUnread ? Math.max(0, s.unreadCount - 1) : s.unreadCount
      }))
    } catch (error) {
      console.error('Failed to mark notification read', error)
      set({ actionError: true, failedAction: id })
      await get().fetchUnread()
    } finally {
      set((s) => ({ pendingIds: s.pendingIds.filter((pending) => pending !== id) }))
    }
  },

  markAllRead: async () => {
    if (get().markAllPending || get().pendingIds.length) return
    set({ markAllPending: true, actionError: false, failedAction: null })
    try {
      await api.markAllInAppNotificationsRead()
      set((s) => ({
        unreadCount: 0,
        items: s.items.map((it) => ({ ...it, readAt: it.readAt ?? new Date().toISOString() }))
      }))
    } catch (error) {
      console.error('Failed to mark all notifications read', error)
      set({ actionError: true, failedAction: 'all' })
      await get().fetchUnread()
    } finally {
      set({ markAllPending: false })
    }
  },

  applySocketBump: () => {
    // Refreshing the list too keeps an open panel from showing a badge count
    // that no longer matches the rows underneath it.
    if (get().panelOpen) {
      void get().fetchList()
      return
    }
    void get().fetchUnread()
  },

  panelOpen: false,
  setPanelOpen: (open) => set({ panelOpen: open })
}))
