import { useServerStore } from './server.store'

jest.mock('@/lib/api', () => ({
  api: {
    get: jest.fn(),
    post: jest.fn(),
  }
}))

import { api } from '@/lib/api'
const mockGet = jest.mocked(api.get)
const mockPost = jest.mocked(api.post)

function resetStore() {
  useServerStore.setState({
    servers: [],
    currentServerId: null,
    viewMode: 'server',
    isLoading: false
  })
}

beforeEach(() => {
  resetStore()
  jest.clearAllMocks()
})

describe('server.store', () => {
  describe('fetchServers', () => {
    it('sets servers from API', async () => {
      mockGet.mockResolvedValue([{ id: 's1', name: 'Test' }])

      await useServerStore.getState().fetchServers()

      expect(useServerStore.getState().servers).toEqual([{ id: 's1', name: 'Test' }])
      expect(useServerStore.getState().isLoading).toBe(false)
    })

    it('resets isLoading on error', async () => {
      mockGet.mockRejectedValue(new Error('fail'))

      await expect(useServerStore.getState().fetchServers()).rejects.toThrow()
      expect(useServerStore.getState().isLoading).toBe(false)
    })
  })

  describe('createServer', () => {
    it('adds server to list with memberCount', async () => {
      mockPost.mockResolvedValue({
        id: 's-new',
        name: 'New Server',
        iconUrl: null,
        ownerId: 'u1',
        createdAt: '2024-01-01',
        members: [{ userId: 'u1' }]
      })

      const server = await useServerStore.getState().createServer('New Server')

      expect(server.memberCount).toBe(1)
      expect(useServerStore.getState().servers).toHaveLength(1)
      expect(useServerStore.getState().servers[0].name).toBe('New Server')
    })

    it('defaults memberCount to 1 when members is absent', async () => {
      mockPost.mockResolvedValue({
        id: 's-new', name: 'S', iconUrl: null, ownerId: 'u1', createdAt: '2024-01-01'
      })

      const server = await useServerStore.getState().createServer('S')
      expect(server.memberCount).toBe(1)
    })
  })

  describe('setCurrentServer', () => {
    it('sets currentServerId and viewMode to server', () => {
      useServerStore.getState().setCurrentServer('s1')

      expect(useServerStore.getState().currentServerId).toBe('s1')
      expect(useServerStore.getState().viewMode).toBe('server')
    })
  })

  describe('setViewMode', () => {
    it('updates viewMode', () => {
      useServerStore.getState().setViewMode('dm')
      expect(useServerStore.getState().viewMode).toBe('dm')
    })
  })

  describe('getCurrentServer', () => {
    it('returns current server when set', () => {
      useServerStore.setState({
        servers: [{ id: 's1', name: 'Test' }] as any,
        currentServerId: 's1'
      })

      expect(useServerStore.getState().getCurrentServer()?.name).toBe('Test')
    })

    it('returns null when no server selected', () => {
      expect(useServerStore.getState().getCurrentServer()).toBeNull()
    })

    it('returns null when currentServerId not in list', () => {
      useServerStore.setState({ currentServerId: 'missing' })
      expect(useServerStore.getState().getCurrentServer()).toBeNull()
    })
  })

  describe('updateServerInList', () => {
    it('patches matching server', () => {
      useServerStore.setState({ servers: [{ id: 's1', name: 'Old' }] as any })

      useServerStore.getState().updateServerInList('s1', { name: 'New' } as any)

      expect(useServerStore.getState().servers[0].name).toBe('New')
    })

    it('does not affect other servers', () => {
      useServerStore.setState({
        servers: [{ id: 's1', name: 'A' }, { id: 's2', name: 'B' }] as any
      })

      useServerStore.getState().updateServerInList('s1', { name: 'Updated' } as any)

      expect(useServerStore.getState().servers[1].name).toBe('B')
    })
  })

  describe('removeServer', () => {
    it('removes server from list', () => {
      useServerStore.setState({
        servers: [{ id: 's1' }, { id: 's2' }] as any
      })

      useServerStore.getState().removeServer('s1')

      expect(useServerStore.getState().servers).toHaveLength(1)
      expect(useServerStore.getState().servers[0].id).toBe('s2')
    })

    it('clears currentServerId when removing the active server', () => {
      useServerStore.setState({
        servers: [{ id: 's1' }] as any,
        currentServerId: 's1'
      })

      useServerStore.getState().removeServer('s1')

      expect(useServerStore.getState().currentServerId).toBeNull()
    })

    it('preserves currentServerId when removing a different server', () => {
      useServerStore.setState({
        servers: [{ id: 's1' }, { id: 's2' }] as any,
        currentServerId: 's2'
      })

      useServerStore.getState().removeServer('s1')

      expect(useServerStore.getState().currentServerId).toBe('s2')
    })
  })
})
