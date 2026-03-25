import type { ServerEvent } from '@chat/shared'
import { create } from 'zustand'
import { api } from '@/lib/api'
import { useAuthStore } from './auth.store'

let _eventFetchId = 0

type EventState = {
  events: ServerEvent[]
  loadedServerId: string | null
  isLoading: boolean
  hasMore: boolean
  nextCursor: string | null
  nextAfterId: string | null
  fetchEvents: (serverId: string) => Promise<void>
  fetchMore: (serverId: string) => Promise<void>
  addEvent: (event: ServerEvent) => void
  updateEvent: (event: ServerEvent) => void
  removeEvent: (eventId: string) => void
  updateInterest: (eventId: string, userId: string, interested: boolean, count: number) => void
  reset: () => void
}

export const useEventStore = create<EventState>((set, get) => ({
  events: [],
  loadedServerId: null,
  isLoading: false,
  hasMore: false,
  nextCursor: null,
  nextAfterId: null,

  fetchEvents: async (serverId) => {
    const fetchId = ++_eventFetchId
    set({ isLoading: true })
    try {
      const result = await api.getServerEvents(serverId)
      if (_eventFetchId !== fetchId) return
      set({
        events: result.events,
        hasMore: result.hasMore,
        nextCursor: result.nextCursor,
        nextAfterId: result.nextAfterId,
        loadedServerId: serverId,
        isLoading: false
      })
    } catch {
      if (_eventFetchId !== fetchId) return
      set({ isLoading: false })
    }
  },

  fetchMore: async (serverId) => {
    const { events, isLoading, hasMore, nextCursor, nextAfterId } = get()
    if (isLoading || !hasMore || events.length === 0) return
    set({ isLoading: true })
    try {
      const result = await api.getServerEvents(serverId, nextCursor ?? undefined, nextAfterId ?? undefined)
      set((s) => {
        const existingIds = new Set(s.events.map((e) => e.id))
        const newEvents = result.events.filter((e) => !existingIds.has(e.id))
        return {
          events: [...s.events, ...newEvents],
          hasMore: result.hasMore,
          nextCursor: result.nextCursor,
          nextAfterId: result.nextAfterId,
          isLoading: false
        }
      })
    } catch {
      set({ isLoading: false })
    }
  },

  addEvent: (event) =>
    set((s) => {
      if (s.loadedServerId !== event.serverId) return s
      const exists = s.events.some((e) => e.id === event.id)
      if (exists) return { events: s.events.map((e) => (e.id === event.id ? event : e)) }
      const events = [...s.events, event].sort(
        (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()
      )
      return { events }
    }),

  updateEvent: (event) =>
    set((s) => ({
      events: s.events.map((e) =>
        e.id === event.id ? { ...event, isInterested: e.isInterested ?? event.isInterested } : e
      )
    })),

  removeEvent: (eventId) =>
    set((s) => ({
      events: s.events.filter((e) => e.id !== eventId)
    })),

  updateInterest: (eventId, userId, interested, count) =>
    set((s) => ({
      events: s.events.map((e) => {
        if (e.id !== eventId) return e
        const update: Partial<ServerEvent> = { interestedCount: count }
        const currentUserId = useAuthStore.getState().user?.id
        if (currentUserId && userId === currentUserId) {
          update.isInterested = interested
        }
        return { ...e, ...update }
      })
    })),

  reset: () => set({ events: [], loadedServerId: null, isLoading: false, hasMore: false, nextCursor: null, nextAfterId: null })
}))
