import { create } from 'zustand'
import { REACTIONS_SEEN_BATCH_SIZE, type ReactionActivity } from '@chat/shared'
import { api } from '@/lib/api'
import type { InAppNotificationDto } from '@/lib/api/types'

type State = {
  unreadCount: number
  serverCounts: Record<string, number>
  reactionsByMessage: ReadonlyMap<string, ReactionActivity[]>
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
  markReactionsSeen: (reactions: ReactionActivity[]) => Promise<void>
  markAllRead: () => Promise<void>
  applySocketBump: () => void
  /** Set by the bell so socket bumps know whether the list is on screen. */
  setPanelOpen: (open: boolean) => void
  panelOpen: boolean
  reset: () => void
}

let epoch = 0
let unreadRequest = 0
let unreadInFlight: Promise<void> | null = null
let unreadDirty = false
let listDirty = false
const reactionRequests = new Map<string, string>()

function indexReactions(
  reactions: ReactionActivity[],
  previous: ReadonlyMap<string, ReactionActivity[]>
): ReadonlyMap<string, ReactionActivity[]> {
  const oldById = new Map([...previous.values()].flat().map((reaction) => [reaction.id, reaction]))
  const next = new Map<string, ReactionActivity[]>()
  for (const reaction of reactions) {
    const old = oldById.get(reaction.id)
    const entry = old?.updatedAt === reaction.updatedAt ? old : reaction
    const group = next.get(entry.messageId)
    if (group) group.push(entry)
    else next.set(entry.messageId, [entry])
  }
  return next
}

export const useNotificationCenterStore = create<State>((set, get) => ({
  unreadCount: 0,
  serverCounts: {},
  reactionsByMessage: new Map(),
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

  fetchUnread: () => {
    if (unreadInFlight) {
      unreadDirty = true
      return unreadInFlight
    }
    const generation = epoch
    const task = (async () => {
      do {
        unreadDirty = false
        const request = ++unreadRequest
        set({ loading: true })
        try {
          const { count, serverCounts = {}, reactions = [] } = await api.getInAppNotificationUnreadCount()
          if (generation !== epoch || request !== unreadRequest) return
          set((state) => ({
            unreadCount: count,
            serverCounts,
            reactionsByMessage: indexReactions(reactions, state.reactionsByMessage),
            unreadError: false
          }))
        } catch (error) {
          console.error('Failed to refresh notification count', error)
          if (generation === epoch && request === unreadRequest) set({ unreadError: true })
        }
      } while (generation === epoch && unreadDirty)
    })().finally(() => {
      if (unreadInFlight === task) {
        unreadInFlight = null
        set({ loading: false })
      }
    })
    unreadInFlight = task
    return task
  },

  fetchList: async (opts) => {
    if (get().listLoading) {
      if (!opts?.append) listDirty = true
      return
    }
    const append = opts?.append ?? false
    const generation = epoch
    set({ listLoading: true, listError: null })
    try {
      const cursor = append ? get().nextCursor : undefined
      const { items, nextCursor } = await api.getInAppNotifications({
        limit: 30,
        ...(cursor ? { cursor } : {})
      })
      if (generation !== epoch) return
      set({
        items: append
          ? [...get().items, ...items.filter((item) => !get().items.some((old) => old.id === item.id))]
          : items,
        nextCursor
      })
      await get().fetchUnread()
    } catch (error) {
      console.error('Failed to load notifications', error)
      if (generation === epoch) set({ listError: append ? 'append' : 'initial' })
    } finally {
      if (generation === epoch) {
        set({ listLoading: false })
        if (listDirty) {
          listDirty = false
          await get().fetchList()
        }
      }
    }
  },

  markRead: async (id: string) => {
    if (get().pendingIds.includes(id) || get().markAllPending) return
    set((s) => ({ pendingIds: [...s.pendingIds, id], actionError: false, failedAction: null }))
    const wasCounted = get().items.some((it) => it.id === id && !it.readAt && it.kind !== 'reaction')
    const generation = epoch
    try {
      await api.markInAppNotificationRead(id)
      if (generation !== epoch) return
      set((s) => ({
        items: s.items.map((it) => (it.id === id ? { ...it, readAt: new Date().toISOString() } : it)),
        unreadCount: wasCounted ? Math.max(0, s.unreadCount - 1) : s.unreadCount
      }))
      await get().fetchUnread()
    } catch (error) {
      console.error('Failed to mark notification read', error)
      if (generation !== epoch) return
      set({ actionError: true, failedAction: id })
      await get().fetchUnread()
    } finally {
      if (generation === epoch) set((s) => ({ pendingIds: s.pendingIds.filter((pending) => pending !== id) }))
    }
  },

  markReactionsSeen: async (reactions) => {
    const generation = epoch
    const pending = get().reactionsByMessage
    const current = reactions.filter((item) => pending.get(item.messageId)?.includes(item))
    for (let offset = 0; offset < current.length && generation === epoch; offset += REACTIONS_SEEN_BATCH_SIZE) {
      const batch = current.slice(offset, offset + REACTIONS_SEEN_BATCH_SIZE)
        .filter(({ id, updatedAt }) => reactionRequests.get(id) !== updatedAt)
      if (batch.length === 0) continue
      const versions = batch.map(({ id, updatedAt }) => ({ id, updatedAt }))
      for (const { id, updatedAt } of versions) reactionRequests.set(id, updatedAt)
      try {
        const { ids, readAt } = await api.markReactionsSeen(versions)
        if (generation !== epoch) return
        const seen = new Set(ids)
        const acknowledged = new Map(versions.filter(({ id }) => seen.has(id)).map(({ id, updatedAt }) => [id, updatedAt]))
        if (seen.size > 0) {
          const isSeen = ({ id, updatedAt }: { id: string; updatedAt: string }) => acknowledged.get(id) === updatedAt
          set((s) => ({
            items: s.items.map((item) => isSeen(item) ? { ...item, readAt } : item),
            reactionsByMessage: indexReactions([...s.reactionsByMessage.values()].flat().filter((item) => !isSeen(item)), s.reactionsByMessage)
          }))
        }
        await get().fetchUnread()
      } catch (error) {
        console.error('Failed to mark reactions seen', error)
      } finally {
        if (generation === epoch) {
          for (const { id, updatedAt } of versions) {
            if (reactionRequests.get(id) === updatedAt) reactionRequests.delete(id)
          }
        }
      }
    }
  },

  markAllRead: async () => {
    if (get().markAllPending || get().pendingIds.length) return
    set({ markAllPending: true, actionError: false, failedAction: null })
    const generation = epoch
    try {
      await api.markAllInAppNotificationsRead()
      if (generation !== epoch) return
      set((s) => ({
        unreadCount: 0,
        serverCounts: {},
        reactionsByMessage: new Map(),
        items: s.items.map((it) => ({ ...it, readAt: it.readAt ?? new Date().toISOString() }))
      }))
      await get().fetchUnread()
    } catch (error) {
      console.error('Failed to mark all notifications read', error)
      if (generation !== epoch) return
      set({ actionError: true, failedAction: 'all' })
      await get().fetchUnread()
    } finally {
      if (generation === epoch) set({ markAllPending: false })
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
  setPanelOpen: (open) => set({ panelOpen: open }),
  reset: () => {
    epoch++
    unreadRequest++
    unreadInFlight = null
    unreadDirty = false
    listDirty = false
    reactionRequests.clear()
    set(useNotificationCenterStore.getInitialState())
  }
}))
