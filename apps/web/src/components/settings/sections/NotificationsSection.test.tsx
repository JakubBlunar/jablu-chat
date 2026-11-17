import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'
import { api } from '@/lib/api'
import { showNotification, subscribeToPush } from '@/lib/notifications'
import { NotificationsSection } from './NotificationsSection'

jest.mock('@/lib/api', () => ({ api: { post: jest.fn() } }))
let mockToken: string | null = null
jest.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: { accessToken: string | null }) => unknown) => selector({ accessToken: mockToken })
}))
jest.mock('@/lib/desktop', () => ({ isDesktop: false }))
jest.mock('./PushDeliverySettings', () => ({ PushDeliverySettings: () => null }))
jest.mock('@/lib/notifications', () => ({
  getNotifSettings: () => ({ enabled: true, soundEnabled: true }),
  saveNotifSettings: jest.fn(),
  showNotification: jest.fn(),
  subscribeToPush: jest.fn()
}))

beforeEach(() => {
  jest.clearAllMocks()
  mockToken = null
})

it('sends device tests through the API route and displays the delivery result', async () => {
  jest.mocked(api.post).mockResolvedValueOnce({ devices: 2 })
  render(<NotificationsSection />)
  fireEvent.click(screen.getByRole('button', { name: 'notifications.sendTest' }))
  expect(api.post).toHaveBeenCalledWith('/api/push/test', {})
  expect(showNotification).toHaveBeenCalled()
  expect(await screen.findByText('notifications.sentToDevices')).toBeInTheDocument()
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
