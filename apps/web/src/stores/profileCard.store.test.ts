import { useProfileCardStore } from './profileCard.store'

jest.mock('@/lib/api', () => ({
  api: {
    getMutualServers: jest.fn(),
    getMutualFriends: jest.fn(),
    getFriendshipStatus: jest.fn()
  }
}))

import { api } from '@/lib/api'

const mockApi = api as jest.Mocked<typeof api>

function reset() {
  useProfileCardStore.setState({ cache: new Map(), inflight: new Map() })
}

describe('profileCard.store', () => {
  beforeEach(() => {
    reset()
    jest.clearAllMocks()
    mockApi.getMutualServers.mockResolvedValue({ servers: [] })
    mockApi.getMutualFriends.mockResolvedValue({ friends: [] })
    mockApi.getFriendshipStatus.mockResolvedValue(null as never)
  })

  it('caches a loaded detail and serves it on peek', async () => {
    await useProfileCardStore.getState().load('u1')
    expect(useProfileCardStore.getState().peek('u1')).toBeDefined()
    expect(mockApi.getMutualServers).toHaveBeenCalledTimes(1)
  })

  it('dedupes concurrent loads into a single request', async () => {
    const store = useProfileCardStore.getState()
    await Promise.all([store.load('u1'), store.load('u1'), store.load('u1')])
    expect(mockApi.getMutualServers).toHaveBeenCalledTimes(1)
  })

  it('serves fresh cache without a second fetch', async () => {
    await useProfileCardStore.getState().load('u1')
    await useProfileCardStore.getState().load('u1')
    expect(mockApi.getMutualServers).toHaveBeenCalledTimes(1)
  })

  it('skips friend lookups for bots', async () => {
    await useProfileCardStore.getState().load('bot1', { isBot: true })
    expect(mockApi.getMutualFriends).not.toHaveBeenCalled()
    expect(mockApi.getFriendshipStatus).not.toHaveBeenCalled()
  })

  it('refetches when forced', async () => {
    await useProfileCardStore.getState().load('u1')
    await useProfileCardStore.getState().load('u1', { force: true })
    expect(mockApi.getMutualServers).toHaveBeenCalledTimes(2)
  })

  it('reports failed details without caching a successful-looking empty profile', async () => {
    const error = new Error('Offline')
    mockApi.getMutualServers.mockRejectedValueOnce(error)
    await expect(useProfileCardStore.getState().load('u1')).rejects.toThrow(error)
    expect(useProfileCardStore.getState().cache.has('u1')).toBe(false)
    expect(useProfileCardStore.getState().inflight.has('u1')).toBe(false)
    await expect(useProfileCardStore.getState().load('u1')).resolves.toBeDefined()
    expect(mockApi.getMutualServers).toHaveBeenCalledTimes(2)
  })

  it('keeps a stale cached profile and logs a failed background refresh', async () => {
    const log = jest.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const cached = await useProfileCardStore.getState().load('u1')
      cached.fetchedAt = Date.now() - 60_001
      const error = new Error('Offline')
      mockApi.getMutualServers.mockRejectedValueOnce(error)
      const refresh = useProfileCardStore.getState().load('u1')
      const pending = useProfileCardStore.getState().inflight.get('u1')
      await expect(refresh).resolves.toBe(cached)
      await expect(pending).rejects.toThrow(error)
      expect(useProfileCardStore.getState().peek('u1')).toBe(cached)
      expect(log).toHaveBeenCalledWith('Could not refresh cached profile details', error)
    } finally {
      log.mockRestore()
    }
  })
})
