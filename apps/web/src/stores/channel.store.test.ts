import { useChannelStore } from './channel.store'

jest.mock('@/lib/api', () => ({
  api: {
    get: jest.fn()
  }
}))

import { api } from '@/lib/api'
const mockGet = jest.mocked(api.get)

const COLLAPSED_KEY = 'chat:collapsed-categories'

function makeChannel(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ch-1',
    serverId: 's1',
    name: 'general',
    type: 'text',
    position: 0,
    categoryId: null,
    pinnedCount: 0,
    isArchived: false,
    ...overrides
  } as any
}

function resetStore() {
  useChannelStore.setState({
    channels: [],
    categories: [],
    collapsedCategories: new Set(),
    currentChannelId: null,
    isLoading: false,
    loadedServerId: null
  })
}

beforeEach(() => {
  resetStore()
  jest.clearAllMocks()
  localStorage.clear()
})

describe('channel.store', () => {
  describe('fetchChannels', () => {
    it('loads channels and categories', async () => {
      const channels = [makeChannel({ id: 'ch-1' }), makeChannel({ id: 'ch-2' })]
      const categories = [{ id: 'cat-1', name: 'Info', position: 0 }]
      mockGet.mockResolvedValueOnce(channels).mockResolvedValueOnce(categories)

      await useChannelStore.getState().fetchChannels('s1')

      const state = useChannelStore.getState()
      expect(state.channels).toHaveLength(2)
      expect(state.categories).toHaveLength(1)
      expect(state.loadedServerId).toBe('s1')
      expect(state.isLoading).toBe(false)
    })

    it('clears channels when switching servers', async () => {
      useChannelStore.setState({ channels: [makeChannel()], loadedServerId: 's1' })
      mockGet.mockResolvedValueOnce([]).mockResolvedValueOnce([])

      await useChannelStore.getState().fetchChannels('s2')

      expect(useChannelStore.getState().loadedServerId).toBe('s2')
    })
  })

  describe('textChannels / voiceChannels', () => {
    it('filters and sorts by position', () => {
      useChannelStore.setState({
        channels: [
          makeChannel({ id: 'v1', type: 'voice', position: 1 }),
          makeChannel({ id: 't2', type: 'text', position: 2 }),
          makeChannel({ id: 't1', type: 'text', position: 0 }),
          makeChannel({ id: 'v2', type: 'voice', position: 0 })
        ]
      })

      const text = useChannelStore.getState().textChannels()
      expect(text.map((c: any) => c.id)).toEqual(['t1', 't2'])

      const voice = useChannelStore.getState().voiceChannels()
      expect(voice.map((c: any) => c.id)).toEqual(['v2', 'v1'])
    })
  })

  describe('getCurrentChannel', () => {
    it('returns null when no channel selected', () => {
      expect(useChannelStore.getState().getCurrentChannel()).toBeNull()
    })

    it('returns the current channel', () => {
      useChannelStore.setState({
        channels: [makeChannel({ id: 'ch-1' })],
        currentChannelId: 'ch-1'
      })
      expect(useChannelStore.getState().getCurrentChannel()!.id).toBe('ch-1')
    })
  })

  describe('addChannel', () => {
    it('adds a new channel', () => {
      useChannelStore.setState({ channels: [makeChannel({ id: 'ch-1' })] })
      useChannelStore.getState().addChannel(makeChannel({ id: 'ch-2' }))
      expect(useChannelStore.getState().channels).toHaveLength(2)
    })

    it('deduplicates by id', () => {
      useChannelStore.setState({ channels: [makeChannel({ id: 'ch-1' })] })
      useChannelStore.getState().addChannel(makeChannel({ id: 'ch-1' }))
      expect(useChannelStore.getState().channels).toHaveLength(1)
    })
  })

  describe('removeChannel', () => {
    it('removes channel and clears currentChannelId if it matches', () => {
      useChannelStore.setState({
        channels: [makeChannel({ id: 'ch-1' }), makeChannel({ id: 'ch-2' })],
        currentChannelId: 'ch-1'
      })
      useChannelStore.getState().removeChannel('ch-1')
      expect(useChannelStore.getState().channels).toHaveLength(1)
      expect(useChannelStore.getState().currentChannelId).toBeNull()
    })
  })

  describe('adjustPinnedCount', () => {
    it('increments pinned count', () => {
      useChannelStore.setState({ channels: [makeChannel({ id: 'ch-1', pinnedCount: 2 })] })
      useChannelStore.getState().adjustPinnedCount('ch-1', 1)
      expect(useChannelStore.getState().channels[0].pinnedCount).toBe(3)
    })

    it('does not go below 0', () => {
      useChannelStore.setState({ channels: [makeChannel({ id: 'ch-1', pinnedCount: 0 })] })
      useChannelStore.getState().adjustPinnedCount('ch-1', -1)
      expect(useChannelStore.getState().channels[0].pinnedCount).toBe(0)
    })
  })

  describe('applyReorder', () => {
    it('reassigns positions by index', () => {
      useChannelStore.setState({
        channels: [
          makeChannel({ id: 'ch-a', position: 0 }),
          makeChannel({ id: 'ch-b', position: 1 }),
          makeChannel({ id: 'ch-c', position: 2 })
        ]
      })
      useChannelStore.getState().applyReorder(['ch-c', 'ch-a', 'ch-b'])
      const positions = useChannelStore.getState().channels.map((c: any) => ({ id: c.id, pos: c.position }))
      expect(positions).toEqual([
        { id: 'ch-a', pos: 1 },
        { id: 'ch-b', pos: 2 },
        { id: 'ch-c', pos: 0 }
      ])
    })
  })

  describe('categories', () => {
    it('addCategory deduplicates', () => {
      const cat = { id: 'cat-1', name: 'Info', position: 0 } as any
      useChannelStore.setState({ categories: [cat] })
      useChannelStore.getState().addCategory(cat)
      expect(useChannelStore.getState().categories).toHaveLength(1)
    })

    it('removeCategory detaches channels', () => {
      useChannelStore.setState({
        categories: [{ id: 'cat-1', name: 'Info', position: 0 }] as any,
        channels: [makeChannel({ id: 'ch-1', categoryId: 'cat-1' })]
      })
      useChannelStore.getState().removeCategory('cat-1')
      expect(useChannelStore.getState().categories).toHaveLength(0)
      expect(useChannelStore.getState().channels[0].categoryId).toBeNull()
    })
  })

  describe('toggleCategoryCollapsed', () => {
    it('toggles and persists to localStorage', () => {
      useChannelStore.getState().toggleCategoryCollapsed('cat-1')
      expect(useChannelStore.getState().isCategoryCollapsed('cat-1')).toBe(true)
      expect(JSON.parse(localStorage.getItem(COLLAPSED_KEY)!)).toContain('cat-1')

      useChannelStore.getState().toggleCategoryCollapsed('cat-1')
      expect(useChannelStore.getState().isCategoryCollapsed('cat-1')).toBe(false)
    })
  })
})
