import '@testing-library/jest-dom'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { api } from '@/lib/api'
import { showNotification, subscribeToPush, unsubscribeFromPush } from '@/lib/notifications'
import { NotificationsSection } from './NotificationsSection'

jest.mock('@/lib/api', () => ({ api: { post: jest.fn() } }))
let mockToken: string | null = null
let mockSuppressAll: boolean | null = null
let mockLocalEnabled = true
const mockUpdatePushPrefs = jest.fn()
jest.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({ accessToken: mockToken, user: { pushSuppressAll: mockSuppressAll }, updatePushPrefs: mockUpdatePushPrefs })
}))
jest.mock('@/lib/desktop', () => ({ isDesktop: false }))
jest.mock('./PushDeliverySettings', () => ({ PushDeliverySettings: () => null }))
jest.mock('@/lib/notifications', () => ({
  useNotificationsEnabled: () => mockSuppressAll == null ? mockLocalEnabled : !mockSuppressAll,
  saveNotifSettings: jest.fn(),
  showNotification: jest.fn(),
  subscribeToPush: jest.fn(),
  unsubscribeFromPush: jest.fn()
}))

beforeEach(() => {
  jest.clearAllMocks()
  mockToken = null
  mockSuppressAll = null
  mockLocalEnabled = true
})

it('saves the account switch and preserves the push subscription while muted', async () => {
  mockToken = 'token'
  mockUpdatePushPrefs.mockResolvedValue(undefined)
  const { rerender } = render(<NotificationsSection />)
  fireEvent.click(screen.getByRole('switch', { name: 'notifications.notificationsLabel' }))
  expect(mockUpdatePushPrefs).toHaveBeenLastCalledWith({ pushSuppressAll: true })
  await waitFor(() => expect(screen.getByRole('switch', { name: 'notifications.notificationsLabel' })).toBeEnabled())

  mockSuppressAll = true
  rerender(<NotificationsSection />)
  expect(screen.getByRole('switch', { name: 'notifications.notificationsLabel' })).not.toBeChecked()
  expect(screen.getByRole('button', { name: 'notifications.sendTest' })).toBeDisabled()
  fireEvent.click(screen.getByRole('switch', { name: 'notifications.notificationsLabel' }))
  expect(mockUpdatePushPrefs).toHaveBeenLastCalledWith({ pushSuppressAll: false })
  expect(unsubscribeFromPush).not.toHaveBeenCalled()
  await waitFor(() => expect(screen.getByRole('switch', { name: 'notifications.notificationsLabel' })).toBeEnabled())
})

it('applies an old device mute account-wide only when requested and reports save errors', async () => {
  mockToken = 'token'
  mockLocalEnabled = false
  mockUpdatePushPrefs.mockRejectedValueOnce(new Error('offline'))
  render(<NotificationsSection />)
  expect(mockUpdatePushPrefs).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'notifications.muteOnAllDevices' }))
  expect(mockUpdatePushPrefs).toHaveBeenCalledWith({ pushSuppressAll: true })
  expect(await screen.findByRole('alert')).toHaveTextContent('notifications.preferenceSaveFailed')
})

it('requests a web push from settings and displays a local test alert', async () => {
  jest.mocked(api.post).mockResolvedValueOnce({ devices: 2 })
  render(<NotificationsSection />)
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'notifications.sendTest' })) })
  expect(api.post).toHaveBeenCalledWith('/api/push/test', {})
  expect(showNotification).toHaveBeenCalled()
})

it('describes the test as queued until a device confirms delivery', async () => {
  jest.mocked(api.post).mockResolvedValueOnce({ devices: 2 })
  render(<NotificationsSection />)
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'notifications.sendTest' })) })
  expect(screen.queryByText('notifications.queuedForDevices')).toBeInTheDocument()
})

it('shows a failed device test inside settings', async () => {
  jest.mocked(api.post).mockRejectedValueOnce(new Error('Push queue unavailable'))
  render(<NotificationsSection />)
  fireEvent.click(screen.getByRole('button', { name: 'notifications.sendTest' }))
  expect(await screen.findByText('Push queue unavailable')).toBeInTheDocument()
})

it('reports a rejected server registration and allows retrying the existing browser endpoint', async () => {
  mockToken = 'token'
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: {} })
  Object.defineProperty(window, 'PushManager', { configurable: true, value: function () {} })
  Object.defineProperty(window, 'Notification', { configurable: true, value: { permission: 'granted' } })
  try {
    jest.mocked(subscribeToPush).mockRejectedValueOnce(new Error('Push registration failed (HTTP 503)'))
    render(<NotificationsSection />)
    expect(await screen.findByText('Push registration failed (HTTP 503)')).toBeInTheDocument()
    expect(screen.queryByText('notifications.pushActive')).not.toBeInTheDocument()
    jest.mocked(subscribeToPush).mockResolvedValueOnce(true)
    fireEvent.click(screen.getByRole('button', { name: 'notifications.enablePush' }))
    expect(await screen.findByText('notifications.pushActive')).toBeInTheDocument()
    expect(subscribeToPush).toHaveBeenNthCalledWith(1, 'token', false, true)
    expect(subscribeToPush).toHaveBeenNthCalledWith(2, 'token', true)
  } finally {
    Reflect.deleteProperty(navigator, 'serviceWorker')
    Reflect.deleteProperty(window, 'PushManager')
  }
})
