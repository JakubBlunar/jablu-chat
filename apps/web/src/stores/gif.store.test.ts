import { useGifStore } from './gif.store'

jest.mock('@/lib/api', () => ({
  api: {
    getGifEnabled: jest.fn().mockResolvedValue({ enabled: true }),
  },
}))

import { api } from '@/lib/api'
const mockGetGifEnabled = api.getGifEnabled as jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
  // Reset store state between tests
  useGifStore.setState({ enabled: false, fetched: false })
})

describe('gif.store', () => {
  it('fetches from API and sets enabled=true on success', async () => {
    mockGetGifEnabled.mockResolvedValue({ enabled: true })
    await useGifStore.getState().fetch()
    expect(useGifStore.getState().enabled).toBe(true)
    expect(useGifStore.getState().fetched).toBe(true)
    expect(mockGetGifEnabled).toHaveBeenCalledTimes(1)
  })

  it('sets enabled=false and fetched=true on API failure', async () => {
    mockGetGifEnabled.mockRejectedValue(new Error('network error'))
    await useGifStore.getState().fetch()
    expect(useGifStore.getState().enabled).toBe(false)
    expect(useGifStore.getState().fetched).toBe(true)
  })

  it('does not call API on second fetch (idempotent)', async () => {
    await useGifStore.getState().fetch()
    await useGifStore.getState().fetch()
    await useGifStore.getState().fetch()
    expect(mockGetGifEnabled).toHaveBeenCalledTimes(1)
  })

  it('returns false when gif is disabled on server', async () => {
    mockGetGifEnabled.mockResolvedValue({ enabled: false })
    await useGifStore.getState().fetch()
    expect(useGifStore.getState().enabled).toBe(false)
  })
})
