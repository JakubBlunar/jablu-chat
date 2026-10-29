import '@testing-library/jest-dom'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { InboxGroup, InboxSession } from '@chat/shared'
import { api } from '@/lib/api'
import { useInboxStore } from '@/stores/inbox.store'
import { useNotificationCenterStore } from '@/stores/notificationCenter.store'
import { InboxWorkspace } from './InboxWorkspace'
import { inboxTargetPath } from '@/lib/inbox'
import { useLayoutStore } from '@/stores/layout.store'

const mockNavigate = jest.fn()
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate
}))
jest.mock('@/lib/api', () => ({
  api: {
    getInbox: jest.fn(),
    getInboxSession: jest.fn(),
    startInboxSession: jest.fn(),
    saveInboxLater: jest.fn(),
    removeInboxLater: jest.fn(),
    markInboxRead: jest.fn(),
    getInAppNotificationUnreadCount: jest.fn()
  }
}))
jest.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: { isAuthenticated: boolean; user: { id: string } }) => unknown) =>
    selector({ isAuthenticated: true, user: { id: 'alice' } })
}))
jest.mock('@/stores/voice-connection.store', () => ({
  useVoiceConnectionStore: { getState: () => ({ setViewingVoiceRoom: jest.fn() }) }
}))
jest.mock('@/stores/thread.store', () => ({
  useThreadStore: { getState: () => ({ closeThread: jest.fn() }) }
}))
jest.mock('@/hooks/useMobile', () => ({ useIsMobile: () => false }))
jest.mock('./InboxActivity', () => ({
  InboxActivity: ({ onNavigate }: { onNavigate: () => void }) => <button onClick={onNavigate}>legacy activity</button>
}))

const group: InboxGroup = {
  key: 'channel:c1',
  name: 'general',
  serverName: 'My community',
  target: { mode: 'channel', contextId: 'c1', serverId: 's1', threadParentId: null, messageId: 'm1' },
  unreadCount: 3,
  mentionCount: 1,
  replyCount: 1,
  latestAt: '2026-01-01T12:00:00.000Z',
  highlights: [
    {
      messageId: 'm1',
      authorName: 'Friend',
      snippet: 'A question for you',
      kind: 'mention',
      createdAt: '2026-01-01T12:00:00.000Z'
    },
    {
      messageId: 'm2',
      authorName: 'Another friend',
      snippet: 'One more thing',
      kind: 'reply',
      createdAt: '2026-01-01T12:01:00.000Z'
    }
  ],
  savedAt: null
}
const session: InboxSession = {
  id: 's',
  revision: 0,
  view: 'mentions',
  groups: [group],
  index: 0,
  completed: 0,
  deferred: 0,
  snapshotAt: '2026-01-01T12:02:00.000Z',
  anchor: null
}
function mount() {
  return render(
    <MemoryRouter>
      <InboxWorkspace />
    </MemoryRouter>
  )
}
beforeEach(() => {
  jest.resetAllMocks()
  jest.spyOn(console, 'error').mockImplementation(() => {})
  useInboxStore.getState().reset()
  useInboxStore.getState().syncUser('alice')
  useNotificationCenterStore.getState().reset()
  useLayoutStore.setState({ navDrawerOpen: false })
  jest.mocked(api.getInAppNotificationUnreadCount).mockResolvedValue({ count: 0 })
  useInboxStore.getState().show()
  jest.mocked(api.getInbox).mockResolvedValue({
    groups: [group],
    counts: { unread: 1, mentions: 1, replies: 1, later: 0 },
    snapshotAt: session.snapshotAt
  })
  jest.mocked(api.getInboxSession).mockResolvedValue({ session: null })
  jest.mocked(api.startInboxSession).mockResolvedValue({ session })
  jest.mocked(api.markInboxRead).mockResolvedValue({ ok: true })
  jest.mocked(api.saveInboxLater).mockResolvedValue({ ok: true })
})
afterEach(() => jest.restoreAllMocks())

it('renders grouped views and expands highlights without acknowledging them', async () => {
  mount()
  await waitFor(() => expect(screen.getByRole('tab', { name: /inboxTab_mentions/ })).toHaveTextContent('1'))
  expect(await screen.findByRole('heading', { name: '#general' })).toBeInTheDocument()
  expect(screen.getByText('My community')).toBeInTheDocument()
  expect(screen.getAllByRole('tab')).toHaveLength(5)
  expect(screen.queryByText('One more thing')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'inboxHighlights' }))
  expect(screen.getByText('One more thing')).toBeInTheDocument()
  expect(api.markInboxRead).not.toHaveBeenCalled()
})

it('filters on the server and retains the notification feed', async () => {
  mount()
  fireEvent.click(screen.getByRole('tab', { name: /inboxTab_mentions/ }))
  await waitFor(() => expect(api.getInbox).toHaveBeenLastCalledWith('mentions', undefined))
  fireEvent.click(screen.getByRole('tab', { name: /inboxTab_activity/ }))
  expect(screen.getByText('legacy activity')).toBeInTheDocument()
})

it('supports keyboard tab navigation', async () => {
  mount()
  await screen.findByRole('heading', { name: '#general' })
  fireEvent.keyDown(screen.getByRole('tab', { name: /inboxTab_unread/ }), { key: 'ArrowRight' })
  expect(screen.getByRole('tab', { name: /inboxTab_mentions/ })).toHaveAttribute('aria-selected', 'true')
  expect(document.activeElement).toBe(screen.getByRole('tab', { name: /inboxTab_mentions/ }))
  fireEvent.keyDown(document.activeElement!, { key: 'Home' })
  expect(screen.getAllByRole('tab')[0]).toHaveAttribute('aria-selected', 'true')
  expect(screen.getAllByRole('tab')[0]).toHaveAccessibleName('inboxTab_activity 0')
  fireEvent.keyDown(document.activeElement!, { key: 'End' })
  expect(screen.getByRole('tab', { name: /inboxTab_later/ })).toHaveFocus()
})

it('puts Notifications first and updates its badge without interrupting the selected view', async () => {
  useNotificationCenterStore.setState({ unreadCount: 4 })
  mount()
  await screen.findByRole('heading', { name: '#general' })
  const notifications = screen.getAllByRole('tab')[0]
  expect(notifications).toHaveAccessibleName('inboxTab_activity 4')
  expect(notifications).toHaveTextContent('4')
  fireEvent.click(screen.getByRole('tab', { name: /inboxTab_mentions/ }))
  act(() => useNotificationCenterStore.setState({ unreadCount: 5 }))
  expect(notifications).toHaveAccessibleName('inboxTab_activity 5')
  expect(notifications).toHaveAttribute('aria-selected', 'false')
  expect(screen.getByRole('tab', { name: /inboxTab_mentions/ })).toHaveAttribute('aria-selected', 'true')
})

it('makes count failures visible on the Notifications tab instead of showing a zero badge', () => {
  useNotificationCenterStore.setState({ unreadError: true })
  mount()
  expect(screen.getAllByRole('tab')[0]).toHaveAccessibleName('inboxTab_activity inboxCountFailed')
  expect(screen.getAllByRole('tab')[0]).toHaveTextContent('!')
})

it('does not switch away from a view the user is already reading while the opening count loads', async () => {
  let resolve!: (result: { count: number }) => void
  jest.mocked(api.getInAppNotificationUnreadCount).mockReturnValueOnce(
    new Promise((done) => { resolve = done })
  )
  useInboxStore.getState().close()
  useInboxStore.getState().show({ preferNotifications: true })
  mount()
  const dialog = await screen.findByRole('dialog')
  fireEvent.wheel(dialog)
  await act(async () => { resolve({ count: 8 }) })
  expect(screen.getByRole('tab', { name: /inboxTab_unread/ })).toHaveAttribute('aria-selected', 'true')
  expect(screen.getAllByRole('tab')[0]).toHaveAccessibleName('inboxTab_activity 8')
})

it('continues an unfinished catch-up from Notifications without changing its queue or progress', async () => {
  useInboxStore.getState().selectTab('activity')
  jest.mocked(api.getInboxSession).mockResolvedValue({ session })
  mount()
  fireEvent.click(await screen.findByRole('button', { name: 'inboxContinueCatchup' }))
  await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/channels/s1/c1?m=m1'))
  expect(api.startInboxSession).toHaveBeenCalledWith('unread', false)
  expect(useInboxStore.getState()).toMatchObject({ tab: 'mentions', session })
  expect(api.markInboxRead).not.toHaveBeenCalled()
})

it('shows retryable catch-up loading failures even when Notifications is selected', async () => {
  useInboxStore.getState().selectTab('activity')
  jest.mocked(api.getInboxSession).mockRejectedValue(new Error('offline'))
  mount()
  expect(await screen.findByRole('alert')).toHaveTextContent('inboxError_resume')
  jest.mocked(api.getInboxSession).mockResolvedValue({ session })
  fireEvent.click(screen.getByRole('button', { name: 'retry' }))
  expect(await screen.findByRole('button', { name: 'inboxContinueCatchup' })).toBeEnabled()
})

it('shows errors instead of an empty-success message and retries', async () => {
  jest.mocked(api.getInbox).mockRejectedValueOnce(new Error('offline'))
  mount()
  expect(await screen.findByRole('alert')).toHaveTextContent('inboxError_load')
  expect(screen.queryByText('inboxViewEmpty')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'retry' }))
  expect(await screen.findByRole('heading', { name: '#general' })).toBeInTheDocument()
})

it('opens the exact preview target without marking read', async () => {
  useLayoutStore.getState().openNavDrawer()
  mount()
  fireEvent.click(await screen.findByRole('button', { name: 'inboxRead' }))
  await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/channels/s1/c1?m=m1'))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(api.markInboxRead).not.toHaveBeenCalled()
  expect(useInboxStore.getState().reader?.group.key).toBe(group.key)
  expect(useLayoutStore.getState().navDrawerOpen).toBe(false)
})

it('closes the underlying navigation menu when opening a notification', async () => {
  useLayoutStore.getState().openNavDrawer()
  useInboxStore.getState().selectTab('activity')
  mount()
  fireEvent.click(screen.getByRole('button', { name: 'legacy activity' }))
  expect(useLayoutStore.getState().navDrawerOpen).toBe(false)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it('continues a saved session and its thread anchor', async () => {
  const saved = { ...session, anchor: { ...group.target, threadParentId: 'parent', messageId: 'last-visible' } }
  jest.mocked(api.getInboxSession).mockResolvedValue({ session: saved })
  jest.mocked(api.startInboxSession).mockResolvedValue({ session: saved })
  mount()
  const start = await screen.findByRole('button', { name: 'inboxContinueCatchup' })
  await waitFor(() => expect(start).not.toBeDisabled())
  fireEvent.click(start)
  await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/channels/s1/c1?m=last-visible&thread=parent'))
  expect(api.startInboxSession).toHaveBeenCalledWith('unread', false)
})

it('shows new activity without replacing the visible queue', async () => {
  mount()
  await screen.findByRole('heading', { name: '#general' })
  act(() => useInboxStore.getState().bump())
  expect(screen.getByRole('button', { name: 'inboxNewActivity' })).toBeInTheDocument()
  expect(api.getInbox).toHaveBeenCalledTimes(1)
})

it('restores trigger focus and closes on Escape', async () => {
  const trigger = document.createElement('button')
  document.body.append(trigger)
  trigger.focus()
  mount()
  await screen.findByRole('dialog')
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(document.activeElement).toBe(trigger)
  trigger.remove()
})

it('preserves thread targets in DM and channel message links', () => {
  expect(inboxTargetPath({ ...group.target, threadParentId: 'parent' })).toBe('/channels/s1/c1?m=m1&thread=parent')
  expect(
    inboxTargetPath({ mode: 'dm', contextId: 'd1', serverId: null, threadParentId: null, messageId: 'dm-message' })
  ).toBe('/channels/@me/d1?m=dm-message')
})
