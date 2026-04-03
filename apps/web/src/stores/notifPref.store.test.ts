import { useNotifPrefStore } from './notifPref.store'

jest.mock('@/lib/api', () => ({
  api: {
    getAllNotifPrefs: jest.fn()
  }
}))

import { api } from '@/lib/api'
const mockGetAll = jest.mocked(api.getAllNotifPrefs)

function resetStore() {
  useNotifPrefStore.setState({
    prefs: {},
    serverPrefs: {}
  })
}

beforeEach(() => {
  resetStore()
  jest.clearAllMocks()
})

describe('notifPref.store', () => {
  describe('set / get / remove', () => {
    it('sets and gets a channel pref', () => {
      useNotifPrefStore.getState().set('ch1', 'mentions')
      expect(useNotifPrefStore.getState().get('ch1')).toBe('mentions')
    })

    it('defaults to "all" for unknown channels', () => {
      expect(useNotifPrefStore.getState().get('unknown')).toBe('all')
    })

    it('removes a channel pref', () => {
      useNotifPrefStore.getState().set('ch1', 'none')
      useNotifPrefStore.getState().remove('ch1')
      expect(useNotifPrefStore.getState().get('ch1')).toBe('all')
    })
  })

  describe('setServer / getServerLevel / removeServer', () => {
    it('sets and gets a server pref', () => {
      useNotifPrefStore.getState().setServer('s1', 'mentions')
      expect(useNotifPrefStore.getState().getServerLevel('s1')).toBe('mentions')
    })

    it('defaults to "all" for unknown servers', () => {
      expect(useNotifPrefStore.getState().getServerLevel('unknown')).toBe('all')
    })

    it('removes a server pref', () => {
      useNotifPrefStore.getState().setServer('s1', 'none')
      useNotifPrefStore.getState().removeServer('s1')
      expect(useNotifPrefStore.getState().getServerLevel('s1')).toBe('all')
    })
  })

  describe('getEffective', () => {
    it('returns channel-level pref when set', () => {
      useNotifPrefStore.getState().set('ch1', 'none')
      expect(useNotifPrefStore.getState().getEffective('ch1', 's1')).toBe('none')
    })

    it('falls back to server-level pref when no channel pref', () => {
      useNotifPrefStore.getState().setServer('s1', 'mentions')
      expect(useNotifPrefStore.getState().getEffective('ch1', 's1')).toBe('mentions')
    })

    it('falls back to "all" when no channel or server pref', () => {
      expect(useNotifPrefStore.getState().getEffective('ch1', 's1')).toBe('all')
    })

    it('falls back to "all" when no serverId provided', () => {
      expect(useNotifPrefStore.getState().getEffective('ch1')).toBe('all')
    })

    it('channel pref takes precedence over server pref', () => {
      useNotifPrefStore.getState().setServer('s1', 'none')
      useNotifPrefStore.getState().set('ch1', 'mentions')
      expect(useNotifPrefStore.getState().getEffective('ch1', 's1')).toBe('mentions')
    })
  })

  describe('fetchAll', () => {
    it('populates prefs and serverPrefs from API', async () => {
      mockGetAll.mockResolvedValue({
        prefs: { ch1: 'mentions', ch2: 'none' },
        serverPrefs: { s1: 'none' }
      } as any)

      await useNotifPrefStore.getState().fetchAll()

      expect(useNotifPrefStore.getState().prefs).toEqual({ ch1: 'mentions', ch2: 'none' })
      expect(useNotifPrefStore.getState().serverPrefs).toEqual({ s1: 'none' })
    })

    it('does not throw on fetch failure', async () => {
      mockGetAll.mockRejectedValue(new Error('network'))

      await expect(useNotifPrefStore.getState().fetchAll()).resolves.toBeUndefined()
    })
  })
})
