import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'
import { LeaderboardModal } from './LeaderboardModal'
import { api } from '@/lib/api'
import { useMemberStore, type Member } from '@/stores/member.store'

jest.mock('@/hooks/useMobile', () => ({ useIsMobile: () => false }))
jest.mock('@/lib/api', () => ({
  api: { getXpLeaderboard: jest.fn(), getMyXpProgress: jest.fn() },
  resolveMediaUrl: (url: string) => url
}))

const user = { id: 'alice', username: 'alice', displayName: 'Global Alice', avatarUrl: null, bio: null }
const member: Member = {
  userId: user.id,
  serverId: 'server',
  displayName: 'Server Alice',
  bio: null,
  user,
  roleIds: [],
  joinedAt: ''
}

beforeEach(() => {
  jest.clearAllMocks()
  useMemberStore.setState({ members: [member] })
  jest
    .mocked(api.getXpLeaderboard)
    .mockResolvedValue([{ rank: 1, userId: user.id, xp: 200, level: 1, user: { ...user, isBot: false } }])
  jest.mocked(api.getMyXpProgress).mockResolvedValue({
    xp: 200,
    level: 1,
    xpIntoLevel: 100,
    xpNeededForLevel: 155,
    nextLevelAt: 255
  })
})

it('renders ranked server activity outside clipping ancestors with a full overlay', async () => {
  const close = jest.fn()
  const { container } = render(
    <div style={{ overflow: 'hidden', transform: 'translateX(0)' }}>
      <LeaderboardModal serverId="server" onClose={close} />
    </div>
  )
  expect(await screen.findByText('Server Alice')).toBeInTheDocument()
  expect(screen.getByText('#1')).toBeInTheDocument()
  expect(screen.getByText('200 XP')).toBeInTheDocument()
  expect(api.getXpLeaderboard).toHaveBeenCalledWith('server')
  expect(api.getMyXpProgress).toHaveBeenCalledWith('server')
  const dialog = screen.getByRole('dialog', { name: 'leaderboard' })
  expect(container).not.toContainElement(dialog)
  expect(dialog.parentElement?.parentElement).toBe(document.body)
  expect(dialog.parentElement).toHaveClass('fixed', 'inset-0', 'z-[120]')
  fireEvent.click(screen.getByRole('button', { name: 'Close' }))
  expect(close).toHaveBeenCalledTimes(1)
})

it('shows leaderboard request failures explicitly', async () => {
  jest.mocked(api.getXpLeaderboard).mockRejectedValueOnce(new Error('Could not load server activity'))
  render(<LeaderboardModal serverId="server" onClose={jest.fn()} />)
  expect(await screen.findByText('Could not load server activity')).toBeInTheDocument()
})
