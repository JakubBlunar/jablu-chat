import '@testing-library/jest-dom'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { ReactionDetailsModal } from './ReactionDetailsModal'
import { useAuthStore } from '@/stores/auth.store'
import { useMemberStore } from '@/stores/member.store'
import { useDmStore } from '@/stores/dm.store'
import { __testing as backGestureTesting } from '@/hooks/useBackGestureClose'
import type { ReactionGroup } from '@chat/shared'

jest.mock('@/lib/socket', () => ({
  getSocket: () => ({ emit: jest.fn() })
}))

const mockIsMobile = jest.fn<boolean, []>(() => false)
jest.mock('@/hooks/useMobile', () => ({
  useIsMobile: () => mockIsMobile()
}))

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      if (key === 'reactionsTitle') return 'Reactions'
      if (key === 'unknownUser') return 'Unknown user'
      return key
    }
  })
}))

beforeEach(() => {
  mockIsMobile.mockReturnValue(false)
  backGestureTesting.reset()
  useAuthStore.setState({ user: { id: 'self', username: 'me', displayName: 'Me' } } as never)
  useMemberStore.setState({ members: [] } as never)
  useDmStore.setState({ conversations: [] } as never)
})

const baseReactions: ReactionGroup[] = [
  { emoji: '👍', count: 2, userIds: ['u1', 'u2'], isCustom: false },
  { emoji: '🔥', count: 1, userIds: ['u3'], isCustom: false }
]

describe('ReactionDetailsModal', () => {
  it('renders a rail entry for each reaction with its count', () => {
    useMemberStore.setState({
      members: [
        { userId: 'u1', user: { id: 'u1', username: 'alice', displayName: 'Alice', avatarUrl: null, bio: null } },
        { userId: 'u2', user: { id: 'u2', username: 'bob', displayName: 'Bob', avatarUrl: null, bio: null } },
        { userId: 'u3', user: { id: 'u3', username: 'carol', displayName: 'Carol', avatarUrl: null, bio: null } }
      ]
    } as never)

    render(
      <ReactionDetailsModal
        reactions={baseReactions}
        initialEmoji="👍"
        mode="channel"
        contextId="ch-1"
        onClose={jest.fn()}
      />
    )

    const rail = screen.getByRole('navigation', { name: 'Reactions' })
    expect(within(rail).getByText('2')).toBeInTheDocument()
    expect(within(rail).getByText('1')).toBeInTheDocument()
  })

  it('resolves channel users via member store and shows their names', () => {
    useMemberStore.setState({
      members: [
        { userId: 'u1', user: { id: 'u1', username: 'alice', displayName: 'Alice', avatarUrl: null, bio: null } },
        { userId: 'u2', user: { id: 'u2', username: 'bob', displayName: null, avatarUrl: null, bio: null } }
      ]
    } as never)

    render(
      <ReactionDetailsModal
        reactions={baseReactions}
        initialEmoji="👍"
        mode="channel"
        contextId="ch-1"
        onClose={jest.fn()}
      />
    )

    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getAllByText('bob').length).toBeGreaterThanOrEqual(1)
  })

  it('switches the right panel when selecting another emoji', () => {
    useMemberStore.setState({
      members: [
        { userId: 'u1', user: { id: 'u1', username: 'alice', displayName: 'Alice', avatarUrl: null, bio: null } },
        { userId: 'u2', user: { id: 'u2', username: 'bob', displayName: 'Bob', avatarUrl: null, bio: null } },
        { userId: 'u3', user: { id: 'u3', username: 'carol', displayName: 'Carol', avatarUrl: null, bio: null } }
      ]
    } as never)

    render(
      <ReactionDetailsModal
        reactions={baseReactions}
        initialEmoji="👍"
        mode="channel"
        contextId="ch-1"
        onClose={jest.fn()}
      />
    )

    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.queryByText('Carol')).not.toBeInTheDocument()

    const rail = screen.getByRole('navigation', { name: 'Reactions' })
    const fireBtn = within(rail).getAllByRole('button')[1]
    fireEvent.click(fireBtn)

    expect(screen.getByText('Carol')).toBeInTheDocument()
    expect(screen.queryByText('Alice')).not.toBeInTheDocument()
  })

  it('resolves DM users via dm store', () => {
    useDmStore.setState({
      conversations: [
        {
          id: 'dm-1',
          isGroup: false,
          groupName: null,
          createdAt: '',
          members: [
            { userId: 'u1', username: 'alice', displayName: 'Alice', avatarUrl: null, bio: null, status: 'offline', createdAt: '' }
          ]
        }
      ]
    } as never)

    render(
      <ReactionDetailsModal
        reactions={[{ emoji: '❤️', count: 1, userIds: ['u1'], isCustom: false }]}
        initialEmoji="❤️"
        mode="dm"
        contextId="dm-1"
        onClose={jest.fn()}
      />
    )

    expect(screen.getByText('Alice')).toBeInTheDocument()
  })

  it('falls back to "Unknown user" when the userId is not in any store', () => {
    render(
      <ReactionDetailsModal
        reactions={[{ emoji: '🐸', count: 1, userIds: ['ghost'], isCustom: false }]}
        initialEmoji="🐸"
        mode="channel"
        contextId="ch-1"
        onClose={jest.fn()}
      />
    )

    expect(screen.getByText('Unknown user')).toBeInTheDocument()
  })

  it('invokes onClose when the close button is clicked', () => {
    const onClose = jest.fn()
    render(
      <ReactionDetailsModal
        reactions={baseReactions}
        initialEmoji="👍"
        mode="channel"
        contextId="ch-1"
        onClose={onClose}
      />
    )

    fireEvent.click(screen.getByLabelText('close'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('registers a back-gesture entry on mobile and clears it on close', () => {
    mockIsMobile.mockReturnValue(true)
    const { unmount } = render(
      <ReactionDetailsModal
        reactions={baseReactions}
        initialEmoji="👍"
        mode="channel"
        contextId="ch-1"
        onClose={jest.fn()}
      />
    )

    expect(backGestureTesting.getStackSize()).toBe(1)
    unmount()
    expect(backGestureTesting.getStackSize()).toBe(0)
  })
})
