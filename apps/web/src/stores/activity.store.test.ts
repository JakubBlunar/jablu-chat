import type { RegisteredGame, UserActivity } from '@chat/shared'
import { useActivityStore } from './activity.store'

jest.mock('@/lib/api', () => ({
  api: {
    getActivitySettings: jest.fn(),
    updateActivitySettings: jest.fn(),
    getRegisteredGames: jest.fn(),
    updateRegisteredGame: jest.fn(),
    deleteRegisteredGame: jest.fn()
  }
}))

import { api } from '@/lib/api'

const mockApi = api as jest.Mocked<typeof api>

const game = (over: Partial<RegisteredGame> = {}): RegisteredGame => ({
  id: 'g1',
  name: 'Halo',
  source: 'process',
  executable: 'halo.exe',
  steamAppId: null,
  iconUrl: null,
  verified: true,
  hidden: false,
  lastPlayedAt: null,
  createdAt: '2026-01-01T00:00:00Z',
  ...over
})

const activity = (over: Partial<UserActivity> = {}): UserActivity => ({
  kind: 'game',
  name: 'Halo',
  details: null,
  state: null,
  iconUrl: null,
  startedAt: '2026-01-01T00:00:00Z',
  ...over
})

function reset() {
  useActivityStore.getState().reset()
}

describe('activity.store', () => {
  beforeEach(() => {
    reset()
    jest.clearAllMocks()
  })

  describe('display activities', () => {
    it('sets and clears a user activity', () => {
      const store = useActivityStore.getState()
      store.setUserActivity('u1', activity())
      expect(useActivityStore.getState().getActivity('u1')?.name).toBe('Halo')

      store.setUserActivity('u1', null)
      expect(useActivityStore.getState().getActivity('u1')).toBeUndefined()
    })

    it('replaces an init snapshot to remove missed clears', () => {
      useActivityStore.getState().setUserActivity('u1', activity())
      useActivityStore.getState().initActivities({ u2: activity({ name: 'Doom' }) })
      const state = useActivityStore.getState()
      expect(state.getActivity('u1')).toBeUndefined()
      expect(state.getActivity('u2')?.name).toBe('Doom')
    })

    it('preserves newer live transitions across an older snapshot', () => {
      const store = useActivityStore.getState()
      store.setUserActivity('u1', null, 12)
      store.setUserActivity('u2', activity(), 13)
      store.initActivities({ u1: activity() }, 10)
      expect(store.getActivity('u1')).toBeUndefined()
      expect(store.getActivity('u2')?.name).toBe('Halo')
      store.setUserActivity('u1', activity(), 11)
      expect(store.getActivity('u1')).toBeUndefined()
      store.initActivities({}, 14)
      expect(store.getActivity('u2')).toBeUndefined()
    })

    it('discards account-specific fetch completions after reset', async () => {
      let finish!: (games: RegisteredGame[]) => void
      mockApi.getRegisteredGames.mockReturnValueOnce(new Promise((resolve) => { finish = resolve }))
      const pending = useActivityStore.getState().fetchGames()
      useActivityStore.getState().reset()
      finish([game()])
      await pending
      expect(useActivityStore.getState().games).toEqual([])
    })
  })

  describe('updateSettings', () => {
    it('optimistically applies and confirms with the server response', async () => {
      useActivityStore.setState({
        settings: {
          shareEnabled: false,
          shareOnline: false,
          defaultSharing: 'friends_all',
          shareGames: true,
          shareMusic: true
        }
      })
      mockApi.updateActivitySettings.mockResolvedValue({
        shareEnabled: true,
        shareOnline: false,
        defaultSharing: 'friends_all',
        shareGames: true,
        shareMusic: true
      })
      await useActivityStore.getState().updateSettings({ shareEnabled: true })
      expect(useActivityStore.getState().settings?.shareEnabled).toBe(true)
    })

    it('rolls back on failure', async () => {
      useActivityStore.setState({
        settings: {
          shareEnabled: false,
          shareOnline: false,
          defaultSharing: 'friends_all',
          shareGames: true,
          shareMusic: true
        }
      })
      mockApi.updateActivitySettings.mockRejectedValue(new Error('boom'))
      await expect(
        useActivityStore.getState().updateSettings({ shareEnabled: true })
      ).rejects.toThrow('boom')
      expect(useActivityStore.getState().settings?.shareEnabled).toBe(false)
    })
  })

  describe('games', () => {
    it('hides a game via the API and updates local state', async () => {
      useActivityStore.setState({ games: [game()] })
      mockApi.updateRegisteredGame.mockResolvedValue(game({ hidden: true }))
      await useActivityStore.getState().setGameHidden('g1', true)
      expect(useActivityStore.getState().games[0].hidden).toBe(true)
    })

    it('removes a game', async () => {
      useActivityStore.setState({ games: [game()] })
      mockApi.deleteRegisteredGame.mockResolvedValue({ ok: true })
      await useActivityStore.getState().removeGame('g1')
      expect(useActivityStore.getState().games).toHaveLength(0)
    })

    it('upserts a game locally by id or name', () => {
      useActivityStore.setState({ games: [game()] })
      useActivityStore.getState().upsertGameLocal(game({ hidden: true }))
      expect(useActivityStore.getState().games).toHaveLength(1)
      expect(useActivityStore.getState().games[0].hidden).toBe(true)

      useActivityStore.getState().upsertGameLocal(game({ id: 'g2', name: 'Doom' }))
      expect(useActivityStore.getState().games).toHaveLength(2)
    })
  })
})
