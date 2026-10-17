jest.mock('workbox-precaching', () => ({ precacheAndRoute: jest.fn(), cleanupOutdatedCaches: jest.fn() }))
jest.mock('workbox-routing', () => ({ registerRoute: jest.fn() }))
jest.mock('workbox-strategies', () => ({ CacheFirst: jest.fn() }))
jest.mock('workbox-expiration', () => ({ ExpirationPlugin: jest.fn() }))

type PushInput = { data: { json: () => unknown }; waitUntil: jest.Mock }
type ClickInput = { notification: { close: jest.Mock; data: { url: string } }; waitUntil: jest.Mock }
const listeners: { push?: (event: PushInput) => void; notificationclick?: (event: ClickInput) => void } = {}
const showNotification = jest.fn().mockResolvedValue(undefined)
const openWindow = jest.fn().mockResolvedValue(undefined)
const matchAll = jest.fn().mockResolvedValue([])
const originalSelf = Object.getOwnPropertyDescriptor(globalThis, 'self')!

beforeAll(async () => {
  Object.defineProperty(globalThis, 'self', {
    configurable: true,
    value: {
      addEventListener: (event: keyof typeof listeners, handler: (typeof listeners)[typeof event]) => {
        Object.assign(listeners, { [event]: handler })
      },
      registration: { showNotification },
      clients: { matchAll, openWindow },
      location: { origin: 'https://jablu.test' },
      __WB_MANIFEST: []
    }
  })
  await import('./sw')
})

afterAll(() => Object.defineProperty(globalThis, 'self', originalSelf))

beforeEach(() => {
  jest.clearAllMocks()
  matchAll.mockResolvedValue([])
})

function push(payload: object) {
  const event = { data: { json: () => payload }, waitUntil: jest.fn() }
  listeners.push!(event)
  return event
}

it('shows an incoming call with the exact-call URL and matching notification tag', () => {
  const url = '/channels/@me/group?call=call-id'
  push({ title: 'Incoming voice call', body: 'Alice is calling', url, expiresAt: Date.now() + 30_000 })
  expect(showNotification).toHaveBeenCalledWith(
    'Incoming voice call',
    expect.objectContaining({
      body: 'Alice is calling',
      data: { url },
      tag: `jablu-${url}`,
      renotify: true
    })
  )
})

it('does not show a call invitation delivered after its deadline', () => {
  const event = push({ title: 'Incoming voice call', expiresAt: Date.now() - 1 })
  expect(showNotification).not.toHaveBeenCalled()
  expect(event.waitUntil).not.toHaveBeenCalled()
})

it('continues showing ordinary message notifications without an expiry', () => {
  push({ title: 'Alice', body: 'Hello', url: '/channels/@me/dm' })
  expect(showNotification).toHaveBeenCalledWith('Alice', expect.objectContaining({ body: 'Hello' }))
})

function click(url: string) {
  const event = { notification: { close: jest.fn(), data: { url } }, waitUntil: jest.fn() }
  listeners.notificationclick!(event)
  return event
}

it('opens a cold PWA at the exact call invitation without accepting', async () => {
  const event = click('/channels/@me/dm?call=call-id')
  await event.waitUntil.mock.calls[0][0]
  expect(event.notification.close).toHaveBeenCalled()
  expect(openWindow).toHaveBeenCalledWith('https://jablu.test/channels/@me/dm?call=call-id')
})

it('focuses and navigates an existing PWA while retaining the call identifier', async () => {
  const client = { url: 'https://jablu.test/channels/@me', focus: jest.fn(), navigate: jest.fn() }
  client.focus.mockResolvedValue(client)
  matchAll.mockResolvedValue([client])
  const event = click('/channels/@me/dm?call=call-id')
  await event.waitUntil.mock.calls[0][0]
  expect(client.navigate).toHaveBeenCalledWith('https://jablu.test/channels/@me/dm?call=call-id')
  expect(openWindow).not.toHaveBeenCalled()
})

it('retains the call query when existing-client navigation needs the message fallback', async () => {
  const client = {
    url: 'https://jablu.test/channels/@me',
    focus: jest.fn().mockRejectedValue(new Error('not focusable')),
    postMessage: jest.fn()
  }
  matchAll.mockResolvedValue([client])
  const event = click('/channels/@me/dm?call=call-id')
  await event.waitUntil.mock.calls[0][0]
  expect(client.postMessage).toHaveBeenCalledWith({ type: 'navigate', url: '/channels/@me/dm?call=call-id' })
})

it('never opens a cross-origin notification target', () => {
  const event = click('https://other.test/channels/@me/dm?call=call-id')
  expect(event.waitUntil).not.toHaveBeenCalled()
  expect(openWindow).not.toHaveBeenCalled()
})
