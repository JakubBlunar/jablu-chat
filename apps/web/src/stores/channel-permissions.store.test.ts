import { useChannelPermissionsStore } from './channel-permissions.store'

jest.mock('@/lib/api', () => ({
  api: {
    getAllChannelPermissions: jest.fn()
  }
}))

import { api } from '@/lib/api'
const mockGetAll = jest.mocked(api.getAllChannelPermissions)

function resetStore() {
  useChannelPermissionsStore.setState({
    permissionsMap: {},
    loadedServerId: null
  })
}

beforeEach(() => {
  resetStore()
  jest.clearAllMocks()
})

describe('channel-permissions.store', () => {
  describe('fetchChannelPermissions', () => {
    it('converts wire string permissions to bigints', async () => {
      mockGetAll.mockResolvedValue({
        ch1: '4096',
        ch2: '8192'
      } as any)

      await useChannelPermissionsStore.getState().fetchChannelPermissions('s1')

      const { permissionsMap, loadedServerId } = useChannelPermissionsStore.getState()
      expect(permissionsMap.ch1).toBe(4096n)
      expect(permissionsMap.ch2).toBe(8192n)
      expect(loadedServerId).toBe('s1')
    })

    it('leaves stale cache on error', async () => {
      useChannelPermissionsStore.setState({
        permissionsMap: { ch1: 1n },
        loadedServerId: 's1'
      })
      mockGetAll.mockRejectedValue(new Error('network'))

      await useChannelPermissionsStore.getState().fetchChannelPermissions('s2')

      expect(useChannelPermissionsStore.getState().permissionsMap.ch1).toBe(1n)
      expect(useChannelPermissionsStore.getState().loadedServerId).toBe('s1')
    })
  })

  describe('clear', () => {
    it('resets permissionsMap and loadedServerId', () => {
      useChannelPermissionsStore.setState({
        permissionsMap: { ch1: 123n },
        loadedServerId: 's1'
      })

      useChannelPermissionsStore.getState().clear()

      expect(useChannelPermissionsStore.getState().permissionsMap).toEqual({})
      expect(useChannelPermissionsStore.getState().loadedServerId).toBeNull()
    })
  })
})
