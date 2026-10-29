import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'
import { api } from '@/lib/api'
import { showNotification } from '@/lib/notifications'
import { NotificationsSection } from './NotificationsSection'

jest.mock('@/lib/api', () => ({ api: { post: jest.fn() } }))
jest.mock('@/lib/desktop', () => ({ isDesktop: false }))
jest.mock('./PushDeliverySettings', () => ({ PushDeliverySettings: () => null }))
jest.mock('@/lib/notifications', () => ({
  getNotifSettings: () => ({ enabled: true, soundEnabled: true }),
  saveNotifSettings: jest.fn(),
  showNotification: jest.fn()
}))

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
