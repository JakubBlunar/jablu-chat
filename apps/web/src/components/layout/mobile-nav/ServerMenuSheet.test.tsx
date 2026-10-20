import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'
import { ServerMenuSheet } from './ServerMenuSheet'
import { makeServer } from '@/test/factories'
import { MobileDrawer } from '@/components/layout/MobileDrawer'
import { waitFor } from '@testing-library/react'

jest.mock('@/hooks/useMobile', () => ({ useIsMobile: () => false }))

const props = {
  server: { ...makeServer('server', { xpEnabled: true }), memberCount: 2 },
  isAdminOrOwner: false,
  canManageServer: false,
  isOwner: false,
  eventCount: 0,
  onClose: jest.fn(),
  onServerSettings: jest.fn(),
  onEditProfile: jest.fn(),
  onLeaderboard: jest.fn(),
  onReorder: jest.fn(),
  onCreateCategory: jest.fn(),
  onMarkAllRead: jest.fn(),
  onNotifSettings: jest.fn(),
  onInvite: jest.fn(),
  onEvents: jest.fn(),
  onChangeRoles: jest.fn(),
  onLeave: jest.fn()
}

beforeEach(() => jest.clearAllMocks())

it('lets ordinary members open the leaderboard from their personal actions', () => {
  render(<ServerMenuSheet {...props} />)
  const leaderboard = screen.getByRole('button', { name: 'leaderboard' })
  expect(screen.queryByRole('button', { name: 'Server Settings' })).not.toBeInTheDocument()
  expect(screen.getByText('personalServerActions').previousElementSibling).toBeNull()
  expect(screen.getByRole('button', { name: 'Leave Server' }).previousElementSibling).toHaveClass('border-t')
  expect(screen.getByText('personalServerActions').compareDocumentPosition(leaderboard)).toBe(
    Node.DOCUMENT_POSITION_FOLLOWING
  )
  fireEvent.click(leaderboard)
  expect(props.onLeaderboard).toHaveBeenCalledTimes(1)
})

it('keeps the leaderboard available to owners and managers as well', () => {
  render(<ServerMenuSheet {...props} isAdminOrOwner canManageServer isOwner />)
  expect(screen.getByRole('button', { name: 'Server Settings' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'leaderboard' })).toBeInTheDocument()
})

it.each([
  { isAdminOrOwner: false, canManageServer: true },
  { isAdminOrOwner: true, canManageServer: false },
  { isAdminOrOwner: true, canManageServer: true }
])('keeps the section separator when management actions are available: %j', (permissions) => {
  render(<ServerMenuSheet {...props} {...permissions} />)
  expect(screen.getByText('serverActions')).toBeInTheDocument()
  expect(screen.getByText('personalServerActions').previousElementSibling).toHaveClass('border-t')
})

it('keeps the leaderboard hidden when server leveling is disabled', () => {
  render(<ServerMenuSheet {...props} server={{ ...props.server, xpEnabled: false }} />)
  expect(screen.queryByRole('button', { name: 'leaderboard' })).not.toBeInTheDocument()
})

it('keeps the menu interactive above the navigation drawer focus trap', async () => {
  const drawer = (
    <MobileDrawer open side="left" onClose={jest.fn()}>
      <button>Navigation</button>
    </MobileDrawer>
  )
  const { rerender } = render(drawer)
  await waitFor(() => expect(screen.getByRole('button', { name: 'Navigation' })).toHaveFocus())
  rerender(
    <>
      {drawer}
      <ServerMenuSheet {...props} />
    </>
  )
  const dialog = screen.getByRole('dialog', { name: props.server.name })
  expect(dialog.parentElement).toBe(document.body)
  await waitFor(() => expect(dialog.inert).not.toBe(true))
  const leaderboard = screen.getByRole('button', { name: 'leaderboard' })
  leaderboard.focus()
  expect(leaderboard).toHaveFocus()
  fireEvent.click(leaderboard)
  expect(props.onLeaderboard).toHaveBeenCalledTimes(1)
})
