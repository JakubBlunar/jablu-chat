import '@testing-library/jest-dom'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { InAppNotificationBell } from './InAppNotificationBell'
import { InboxActivity } from './InboxActivity'
import { useInboxStore } from '@/stores/inbox.store'
import { useNotificationCenterStore } from '@/stores/notificationCenter.store'
import { api } from '@/lib/api'
import type { InAppNotificationDto } from '@/lib/api/types'

jest.mock('@/lib/api', () => ({
  api: {
    getInAppNotifications: jest.fn(),
    getInAppNotificationUnreadCount: jest.fn(),
    markAllInAppNotificationsRead: jest.fn(),
    markInAppNotificationRead: jest.fn()
  }
}))
jest.mock('@/hooks/useAppNavigate', () => ({ useAppNavigate: () => ({ navigate: jest.fn() }) }))
jest.mock('@/hooks/useFocusTrap', () => ({ useFocusTrap: jest.fn() }))
jest.mock('@/hooks/useBackGestureClose', () => ({ useBackGestureClose: jest.fn() }))
const item: InAppNotificationDto = {
  id: 'n1',
  kind: 'announcement',
  payload: { title: 'Release notes' },
  readAt: null,
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01'
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(console, 'error').mockImplementation(() => {})
  useNotificationCenterStore.setState(useNotificationCenterStore.getInitialState(), true)
  useInboxStore.getState().reset()
  jest.mocked(api.getInAppNotificationUnreadCount).mockResolvedValue({ count: 1 })
})
afterEach(() => jest.restoreAllMocks())

it('shows a retryable failure, not caught up, after a failed initial load', async () => {
  jest
    .mocked(api.getInAppNotifications)
    .mockRejectedValueOnce(new Error('503'))
    .mockResolvedValueOnce({ items: [item] })
  render(<InboxActivity onNavigate={jest.fn()} />)
  expect(await screen.findByRole('alert')).toHaveTextContent('inboxLoadFailed')
  expect(screen.queryByText('inboxCaughtUp')).not.toBeInTheDocument()
  fireEvent.click(screen.getByText('retry'))
  expect(await screen.findByText('Release notes')).toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

it('keeps cached entries and pagination after refresh and append failures', async () => {
  useNotificationCenterStore.setState({ items: [item], nextCursor: 'older' })
  jest.mocked(api.getInAppNotifications).mockRejectedValue(new Error('offline'))
  await useNotificationCenterStore.getState().fetchList()
  expect(useNotificationCenterStore.getState()).toMatchObject({
    items: [item],
    nextCursor: 'older',
    listError: 'initial'
  })
  await useNotificationCenterStore.getState().fetchList({ append: true })
  expect(useNotificationCenterStore.getState()).toMatchObject({
    items: [item],
    nextCursor: 'older',
    listError: 'append'
  })
})

it('does not mark items read on failure and retries the actual failed operation', async () => {
  useNotificationCenterStore.setState({ items: [item], unreadCount: 1 })
  jest
    .mocked(api.markAllInAppNotificationsRead)
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce({ updated: 1 })
  await useNotificationCenterStore.getState().markAllRead()
  expect(useNotificationCenterStore.getState()).toMatchObject({
    actionError: true,
    markAllPending: false,
    unreadCount: 1
  })
  expect(useNotificationCenterStore.getState().items[0].readAt).toBeNull()
  await useNotificationCenterStore.getState().retryAction()
  expect(api.markAllInAppNotificationsRead).toHaveBeenCalledTimes(2)
  expect(useNotificationCenterStore.getState()).toMatchObject({ unreadCount: 0, actionError: false })
})

it('keeps cached entries visible in the panel after a failed refresh', async () => {
  useNotificationCenterStore.setState({ items: [item] })
  jest.mocked(api.getInAppNotifications).mockRejectedValue(new Error('offline'))
  render(<InboxActivity onNavigate={jest.fn()} />)
  await screen.findByRole('alert')
  await waitFor(() => expect(screen.getByText('Release notes')).toBeInTheDocument())
  expect(screen.getByText('Release notes').closest('.simplebar-content')).toBeInTheDocument()
  expect(document.querySelector('.simplebar-track.simplebar-vertical')).toBeInTheDocument()
})

it('opens Notifications for unread activity without mounting or acknowledging the feed itself', async () => {
  render(<InAppNotificationBell />)
  await waitFor(() => expect(useNotificationCenterStore.getState().unreadCount).toBe(1))
  fireEvent.click(screen.getByRole('button'))
  expect(useInboxStore.getState().open).toBe(true)
  expect(useInboxStore.getState().tab).toBe('activity')
  expect(api.getInAppNotifications).not.toHaveBeenCalled()
  expect(api.markAllInAppNotificationsRead).not.toHaveBeenCalled()
  expect(api.markInAppNotificationRead).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button'))
  expect(useInboxStore.getState().open).toBe(false)
})

it('opens the last chosen view when there are no unread notifications', async () => {
  jest.mocked(api.getInAppNotificationUnreadCount).mockResolvedValue({ count: 0 })
  useInboxStore.getState().selectTab('later')
  render(<InAppNotificationBell />)
  await waitFor(() => expect(useNotificationCenterStore.getState().loading).toBe(false))
  fireEvent.click(screen.getByRole('button'))
  expect(useInboxStore.getState()).toMatchObject({ open: true, tab: 'later' })
})

it('discards legacy notification responses arriving after account cleanup', async () => {
  let resolve!: (result: { items: InAppNotificationDto[] }) => void
  jest.mocked(api.getInAppNotifications).mockReturnValueOnce(
    new Promise((done) => {
      resolve = done
    })
  )
  const request = useNotificationCenterStore.getState().fetchList()
  useNotificationCenterStore.getState().reset()
  resolve({ items: [item] })
  await request
  expect(useNotificationCenterStore.getState()).toMatchObject({ items: [], listLoading: false, unreadCount: 0 })
})
