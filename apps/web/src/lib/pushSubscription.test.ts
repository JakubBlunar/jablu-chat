import { subscribeToPush, unsubscribeFromPush } from './notifications'

let mockToken = 'alice'
jest.mock('@/stores/auth.store', () => ({ useAuthStore: { getState: () => ({ isAuthenticated: !!mockToken, accessToken: mockToken }) } }))

const mockFetch = jest.fn()
const subscription = {
  endpoint: 'https://push.example/device',
  toJSON: () => ({ keys: { p256dh: 'key', auth: 'auth' } }),
  unsubscribe: jest.fn().mockResolvedValue(true)
}
const registration = {
  active: {},
  pushManager: {
    getSubscription: jest.fn(),
    subscribe: jest.fn()
  }
}
const getRegistration = jest.fn()

beforeEach(async () => {
  // Drain the previous operation before replacing platform mocks.
  await unsubscribeFromPush()
  jest.clearAllMocks()
  mockToken = 'alice'
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { getRegistration }
  })
  Object.defineProperty(window, 'PushManager', { configurable: true, value: function () {} })
  Object.defineProperty(window, 'Notification', { configurable: true, value: { permission: 'granted' } })
  globalThis.fetch = mockFetch
  getRegistration.mockResolvedValue(registration)
  registration.pushManager.getSubscription.mockResolvedValue(subscription)
  registration.pushManager.subscribe.mockResolvedValue(subscription)
  subscription.unsubscribe.mockResolvedValue(true)
  mockFetch.mockImplementation(async (url: string) => ({
    ok: true,
    status: 200,
    json: async () => (url.endsWith('vapid-key') ? { key: 'AQID' } : {})
  }))
})

afterEach(async () => {
  await unsubscribeFromPush()
  Reflect.deleteProperty(navigator, 'serviceWorker')
  Reflect.deleteProperty(window, 'PushManager')
})

it('does not cache an unsuccessful registration and retries with the server', async () => {
  mockFetch.mockImplementation(async (url: string) => ({
    ok: url.endsWith('vapid-key'),
    status: 503,
    json: async () => ({ key: 'AQID' })
  }))
  await expect(subscribeToPush('alice')).rejects.toThrow('HTTP 503')
  mockFetch.mockImplementation(async () => ({ ok: true, json: async () => ({ key: 'AQID' }) }))
  await expect(subscribeToPush('alice')).resolves.toBe(true)
  expect(mockFetch.mock.calls.filter(([url]) => url.endsWith('/subscribe'))).toHaveLength(2)
})

it('registers a different account and lets Settings recheck an existing browser endpoint', async () => {
  await subscribeToPush('alice')
  await subscribeToPush('alice')
  mockToken = 'bob'
  await subscribeToPush('bob')
  await subscribeToPush('bob', false, true)
  const posts = mockFetch.mock.calls.filter(([url]) => url.endsWith('/subscribe'))
  expect(posts).toHaveLength(3)
  expect(posts[1][1].headers.Authorization).toBe('Bearer bob')
})

it('revokes locally before attempting server cleanup with an expired token', async () => {
  mockFetch.mockImplementation(async () => {
    expect(subscription.unsubscribe).toHaveBeenCalledTimes(1)
    throw new Error('offline')
  })
  await expect(unsubscribeFromPush('expired')).resolves.toBeUndefined()
  expect(subscription.unsubscribe).toHaveBeenCalledTimes(1)
})

it('revokes the browser endpoint even when no token remains', async () => {
  await unsubscribeFromPush()
  expect(subscription.unsubscribe).toHaveBeenCalledTimes(1)
  expect(mockFetch).not.toHaveBeenCalled()
})

it('settles when a worker is not installed yet and can retry after installation', async () => {
  getRegistration.mockResolvedValueOnce(undefined)
  await expect(subscribeToPush('alice')).resolves.toBe(false)
  await expect(subscribeToPush('alice')).resolves.toBe(true)
})

it('removes a subscription that finishes being created after logout starts', async () => {
  let finish!: (value: typeof subscription) => void
  let started!: () => void
  const creating = new Promise<void>((resolve) => {
    started = resolve
  })
  registration.pushManager.getSubscription.mockResolvedValueOnce(null)
  registration.pushManager.subscribe.mockImplementationOnce(() => {
    started()
    return new Promise((resolve) => {
      finish = resolve
    })
  })
  const subscribing = subscribeToPush('alice')
  await creating
  const logout = unsubscribeFromPush('alice')
  finish(subscription)
  await expect(subscribing).resolves.toBe(false)
  await logout
  expect(subscription.unsubscribe).toHaveBeenCalledTimes(1)
  expect(mockFetch.mock.calls.filter(([url]) => url.endsWith('/subscribe'))).toHaveLength(0)
})

it('aborts a pending registration on logout before accepting another account', async () => {
  let started!: () => void
  const posting = new Promise<void>((resolve) => {
    started = resolve
  })
  const normalFetch = mockFetch.getMockImplementation()!
  mockFetch.mockImplementation((url: string, options: RequestInit) => {
    if (
      url.endsWith('/subscribe') &&
      options.headers &&
      (options.headers as Record<string, string>).Authorization === 'Bearer alice'
    ) {
      started()
      return new Promise((_resolve, reject) => {
        options.signal!.addEventListener('abort', () => reject(new Error('aborted')))
      })
    }
    return normalFetch(url, options)
  })
  const subscribing = subscribeToPush('alice').catch(() => false)
  await posting
  const logout = unsubscribeFromPush('alice')
  mockToken = 'bob'
  const login = subscribeToPush('bob')
  await expect(subscribing).resolves.toBe(false)
  await logout
  await expect(login).resolves.toBe(true)
  expect(subscription.unsubscribe).toHaveBeenCalledTimes(1)
})

it('ignores delayed registration attempts carrying a logged-out account token', async () => {
  mockToken = ''
  await expect(subscribeToPush('alice')).resolves.toBe(false)
  mockToken = 'bob'
  await expect(subscribeToPush('alice')).resolves.toBe(false)
  expect(mockFetch).not.toHaveBeenCalled()
})
