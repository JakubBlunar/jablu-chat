import { useEventStore } from './event.store'

jest.mock('@/lib/api', () => ({
  api: {
    getServerEvents: jest.fn()
  }
}))

jest.mock('./auth.store', () => ({
  useAuthStore: {
    getState: () => ({ user: { id: 'me' } })
  }
}))

import { api } from '@/lib/api'
const mockGetEvents = jest.mocked(api.getServerEvents)

function resetStore() {
  useEventStore.getState().reset()
}

function makeEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ev-1',
    serverId: 's1',
    name: 'Game Night',
    startAt: '2025-06-20T18:00:00Z',
    interestedCount: 0,
    isInterested: false,
    ...overrides
  } as any
}

beforeEach(() => {
  resetStore()
  jest.clearAllMocks()
})

describe('event.store', () => {
  describe('fetchEvents', () => {
    it('loads events and sets pagination state', async () => {
      mockGetEvents.mockResolvedValueOnce({
        events: [makeEvent()],
        hasMore: true,
        nextCursor: 'c1',
        nextAfterId: 'a1'
      })

      await useEventStore.getState().fetchEvents('s1')

      const state = useEventStore.getState()
      expect(state.events).toHaveLength(1)
      expect(state.hasMore).toBe(true)
      expect(state.loadedServerId).toBe('s1')
      expect(state.isLoading).toBe(false)
    })

    it('discards stale responses', async () => {
      let resolveSlow!: (v: any) => void
      mockGetEvents.mockImplementationOnce(() => new Promise((r) => { resolveSlow = r }))
      const firstFetch = useEventStore.getState().fetchEvents('s1')

      mockGetEvents.mockResolvedValueOnce({ events: [makeEvent({ id: 'ev-2' })], hasMore: false, nextCursor: null, nextAfterId: null })
      await useEventStore.getState().fetchEvents('s2')

      resolveSlow({ events: [makeEvent()], hasMore: false, nextCursor: null, nextAfterId: null })
      await firstFetch

      expect(useEventStore.getState().loadedServerId).toBe('s2')
    })
  })

  describe('fetchMore', () => {
    it('guards against loading or no hasMore', async () => {
      useEventStore.setState({ events: [makeEvent()], hasMore: false })
      await useEventStore.getState().fetchMore('s1')
      expect(mockGetEvents).not.toHaveBeenCalled()
    })

    it('appends and deduplicates', async () => {
      const ev1 = makeEvent({ id: 'ev-1' })
      const ev2 = makeEvent({ id: 'ev-2', startAt: '2025-06-21T18:00:00Z' })
      useEventStore.setState({ events: [ev1], hasMore: true, nextCursor: 'c1', loadedServerId: 's1' })

      mockGetEvents.mockResolvedValueOnce({ events: [ev1, ev2], hasMore: false, nextCursor: null, nextAfterId: null })

      await useEventStore.getState().fetchMore('s1')

      expect(useEventStore.getState().events).toHaveLength(2)
    })
  })

  describe('addEvent', () => {
    it('inserts sorted by startAt', () => {
      useEventStore.setState({
        loadedServerId: 's1',
        events: [makeEvent({ id: 'ev-1', startAt: '2025-06-20T18:00:00Z' })]
      })

      useEventStore.getState().addEvent(makeEvent({ id: 'ev-2', startAt: '2025-06-19T12:00:00Z' }))

      const events = useEventStore.getState().events
      expect(events[0].id).toBe('ev-2')
      expect(events[1].id).toBe('ev-1')
    })

    it('updates existing event by id', () => {
      useEventStore.setState({
        loadedServerId: 's1',
        events: [makeEvent({ id: 'ev-1', name: 'Old' })]
      })

      useEventStore.getState().addEvent(makeEvent({ id: 'ev-1', name: 'New' }))

      expect(useEventStore.getState().events).toHaveLength(1)
      expect(useEventStore.getState().events[0].name).toBe('New')
    })

    it('ignores events for a different server', () => {
      useEventStore.setState({ loadedServerId: 's1', events: [] })
      useEventStore.getState().addEvent(makeEvent({ serverId: 's2' }))
      expect(useEventStore.getState().events).toHaveLength(0)
    })
  })

  describe('updateEvent', () => {
    it('preserves isInterested from existing state', () => {
      useEventStore.setState({ events: [makeEvent({ id: 'ev-1', isInterested: true })] })
      useEventStore.getState().updateEvent(makeEvent({ id: 'ev-1', isInterested: false }))
      expect(useEventStore.getState().events[0].isInterested).toBe(true)
    })
  })

  describe('updateInterest', () => {
    it('updates count and isInterested for current user', () => {
      useEventStore.setState({ events: [makeEvent({ id: 'ev-1', interestedCount: 0, isInterested: false })] })
      useEventStore.getState().updateInterest('ev-1', 'me', true, 5)

      const ev = useEventStore.getState().events[0]
      expect(ev.interestedCount).toBe(5)
      expect(ev.isInterested).toBe(true)
    })

    it('only updates count for other users', () => {
      useEventStore.setState({ events: [makeEvent({ id: 'ev-1', interestedCount: 0, isInterested: false })] })
      useEventStore.getState().updateInterest('ev-1', 'other-user', true, 3)

      const ev = useEventStore.getState().events[0]
      expect(ev.interestedCount).toBe(3)
      expect(ev.isInterested).toBe(false)
    })
  })

  describe('reset', () => {
    it('clears all state', () => {
      useEventStore.setState({ events: [makeEvent()], loadedServerId: 's1', hasMore: true })
      useEventStore.getState().reset()
      expect(useEventStore.getState().events).toEqual([])
      expect(useEventStore.getState().loadedServerId).toBeNull()
    })
  })
})
