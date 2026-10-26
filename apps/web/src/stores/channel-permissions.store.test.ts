import { useChannelPermissionsStore } from './channel-permissions.store'
import { clearStructureCache, getPermissions, putPermissions } from '@/lib/cache/structureCache'

jest.mock('@/lib/api', () => ({
  api: {
    getAllChannelPermissions: jest.fn()
  }
}))

import { api } from '@/lib/api'
const mockGetAll = jest.mocked(api.getAllChannelPermissions)

function resetStore() {
  useChannelPermissionsStore.getState().clear()
  clearStructureCache()
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

    it('never carries another server permissions into a failed server switch', async () => {
      useChannelPermissionsStore.setState({
        permissionsMap: { ch1: 1n },
        loadedServerId: 's1'
      })
      mockGetAll.mockRejectedValue(new Error('network'))

      await useChannelPermissionsStore.getState().fetchChannelPermissions('s2')

      expect(useChannelPermissionsStore.getState().permissionsMap).toEqual({})
      expect(useChannelPermissionsStore.getState().loadedServerId).toBe('s2')
    })

    it('preserves same-server cache on transport errors but evicts it on revoked access', async () => {
      putPermissions('s1', { ch1: '1' })
      useChannelPermissionsStore.getState().hydrateFromCache('s1')
      mockGetAll.mockRejectedValueOnce(new Error('network'))
      await useChannelPermissionsStore.getState().fetchChannelPermissions('s1')
      expect(useChannelPermissionsStore.getState().permissionsMap.ch1).toBe(1n)
      mockGetAll.mockRejectedValueOnce({ status: 403 })
      await useChannelPermissionsStore.getState().fetchChannelPermissions('s1')
      expect(useChannelPermissionsStore.getState().permissionsMap).toEqual({})
      expect(getPermissions('s1')).toBeNull()
    })

    it('shares in-flight reads and prevents the first A response from winning after A-B-A navigation', async () => {
      const pending: { signal: AbortSignal; resolve: (wire: Record<string, string>) => void }[] = []
      mockGetAll.mockImplementation((_id, options) => new Promise(resolve => { pending.push({ signal: options!.signal!, resolve }) }))
      const first = useChannelPermissionsStore.getState().fetchChannelPermissions('a')
      expect(useChannelPermissionsStore.getState().fetchChannelPermissions('a')).toBe(first)
      await Promise.resolve()
      const middle = useChannelPermissionsStore.getState().fetchChannelPermissions('b')
      await Promise.resolve()
      const last = useChannelPermissionsStore.getState().fetchChannelPermissions('a')
      await Promise.resolve()
      expect(pending[0].signal.aborted).toBe(true)
      expect(pending[1].signal.aborted).toBe(true)
      pending[2].resolve({ newest: '8' })
      await last
      pending[0].resolve({ stale: '4' })
      pending[1].resolve({ wrongServer: '2' })
      await Promise.all([first, middle])
      expect(useChannelPermissionsStore.getState().permissionsMap).toEqual({ newest: 8n })
      expect(getPermissions('a')?.permissions).toEqual({ newest: '8' })
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
