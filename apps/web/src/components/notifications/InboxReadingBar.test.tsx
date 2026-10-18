import '@testing-library/jest-dom'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { InboxGroup, InboxSession } from '@chat/shared'
import { api } from '@/lib/api'
import { useInboxStore } from '@/stores/inbox.store'
import { InboxReadingBar } from './InboxReadingBar'

jest.mock('@/lib/api', () => ({
  api: { saveInboxAnchor: jest.fn(), advanceInboxSession: jest.fn(), getInboxSession: jest.fn() }
}))
jest.mock('@/stores/readState.store', () => ({ useReadStateStore: { getState: () => ({ fetchAll: jest.fn() }) } }))
jest.mock('@/stores/notificationCenter.store', () => ({
  useNotificationCenterStore: { getState: () => ({ fetchUnread: jest.fn() }) }
}))
jest.mock('@/stores/thread.store', () => ({
  useThreadStore: (selector: (state: { isOpen: boolean }) => unknown) => selector({ isOpen: false })
}))
jest.mock('@/stores/forum.store', () => ({
  useForumStore: (selector: (state: { currentPostId: null }) => unknown) => selector({ currentPostId: null })
}))

const group: InboxGroup = {
  key: 'channel:c1',
  name: 'general',
  serverName: 'Test',
  target: { mode: 'channel', contextId: 'c1', serverId: 's1', threadParentId: null, messageId: 'm1' },
  unreadCount: 2,
  mentionCount: 0,
  replyCount: 1,
  latestAt: '2026-01-01T12:00:00.000Z',
  savedAt: null,
  highlights: []
}
const session: InboxSession = {
  id: 'session',
  revision: 0,
  view: 'unread',
  snapshotAt: group.latestAt,
  groups: [group],
  index: 0,
  completed: 0,
  deferred: 0,
  anchor: group.target
}
function mount(path = '/channels/s1/c1') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <InboxReadingBar />
    </MemoryRouter>
  )
}
beforeEach(() => {
  jest.resetAllMocks()
  jest.spyOn(console, 'error').mockImplementation(() => {})
  useInboxStore.getState().reset()
  useInboxStore.setState({ session })
  useInboxStore.getState().resume()
  useInboxStore.getState().confirmNavigation('channel', 'c1', 'm1', null)
  jest
    .mocked(api.advanceInboxSession)
    .mockResolvedValue({ session: { ...session, index: 1, revision: 1, completed: 1 } })
})
afterEach(() => jest.restoreAllMocks())

it('finishes using the revision-protected session API and reopens Inbox', async () => {
  mount()
  fireEvent.click(screen.getByRole('button', { name: 'inboxDone' }))
  await waitFor(() => expect(api.advanceInboxSession).toHaveBeenCalledWith('session', 0, 'done'))
  await waitFor(() => expect(useInboxStore.getState().open).toBe(true))
  expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
})

it('does not offer actions for a different conversation or a closed target thread', () => {
  mount('/channels/s1/other')
  expect(screen.queryByRole('button', { name: 'inboxDone' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'inboxResumeReading' })).toBeInTheDocument()
})

it('requires a loaded destination before Done, but always allows Skip', () => {
  useInboxStore.getState().resume()
  mount()
  expect(screen.getByRole('button', { name: 'inboxDone' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'inboxNext' })).not.toBeDisabled()
})

it('shows a localized unavailable target and allows Skip without loading or acknowledging it', async () => {
  useInboxStore.setState({ session: { ...session, groups: [{ ...group, unavailable: true, name: 'Unavailable' }] } })
  useInboxStore.getState().resume()
  mount('/channels/@me')
  expect(screen.getByText('inboxUnavailable')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'inboxDone' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'inboxNext' }))
  await waitFor(() => expect(api.advanceInboxSession).toHaveBeenCalledWith('session', 0, 'skip'))
  expect(api.saveInboxAnchor).not.toHaveBeenCalled()
})

it('retries the actual failed advance operation, not an unrelated anchor request', async () => {
  jest.mocked(api.advanceInboxSession).mockRejectedValueOnce(new Error('offline'))
  mount()
  fireEvent.click(screen.getByRole('button', { name: 'inboxDone' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('inboxError_action')
  fireEvent.click(screen.getByRole('button', { name: 'retry' }))
  await waitFor(() => expect(api.advanceInboxSession).toHaveBeenCalledTimes(2))
  expect(api.saveInboxAnchor).not.toHaveBeenCalled()
})
