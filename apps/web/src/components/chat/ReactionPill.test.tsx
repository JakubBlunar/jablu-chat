import '@testing-library/jest-dom'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { ReactionPill } from './ReactionPill'
import { useAuthStore } from '@/stores/auth.store'
import { useMemberStore } from '@/stores/member.store'
import { useDmStore } from '@/stores/dm.store'
import type { ReactionGroup } from '@chat/shared'

const mockEmit = jest.fn()

jest.mock('@/lib/socket', () => ({
  getSocket: () => ({ emit: mockEmit })
}))

const mockIsMobile = jest.fn<boolean, []>(() => false)
jest.mock('@/hooks/useMobile', () => ({
  useIsMobile: () => mockIsMobile()
}))

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { count?: number }) => {
      if (key === 'reactedBy') return 'reacted by'
      if (key === 'unknownUser') return 'Unknown user'
      if (key === 'andOthers') return `and ${opts?.count ?? 0} others`
      return key
    }
  })
}))

function reaction(overrides: Partial<ReactionGroup> = {}): ReactionGroup {
  return {
    emoji: '👍',
    count: 1,
    userIds: ['user-1'],
    isCustom: false,
    ...overrides
  }
}

beforeEach(() => {
  mockEmit.mockClear()
  mockIsMobile.mockReturnValue(false)
  useAuthStore.setState({ user: { id: 'self', username: 'me', displayName: 'Me' } } as never)
  useMemberStore.setState({ members: [] } as never)
  useDmStore.setState({ conversations: [] } as never)
})

describe('ReactionPill', () => {
  it('toggles the reaction via socket on click', () => {
    render(
      <ReactionPill
        reaction={reaction({ emoji: '🔥', isCustom: false })}
        messageId="msg-1"
        mode="channel"
        contextId="ch-1"
        onShowReactors={jest.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: '🔥 1' }))

    expect(mockEmit).toHaveBeenCalledWith(
      'reaction:toggle',
      {
        messageId: 'msg-1',
        emoji: '🔥',
        isCustom: false
      },
      expect.any(Function)
    )
  })

  it('marks the pill as pressed when the current user has reacted', () => {
    render(
      <ReactionPill
        reaction={reaction({ userIds: ['self'] })}
        messageId="msg-1"
        mode="channel"
        contextId="ch-1"
        onShowReactors={jest.fn()}
      />
    )

    expect(screen.getByRole('button', { name: /👍/ })).toHaveAttribute('aria-pressed', 'true')
  })

  describe('desktop hover tooltip', () => {
    beforeEach(() => {
      jest.useFakeTimers()
      useMemberStore.setState({
        members: [
          { userId: 'u1', user: { id: 'u1', username: 'alice', displayName: 'Alice', avatarUrl: null, bio: null } },
          { userId: 'u2', user: { id: 'u2', username: 'bob', displayName: 'Bob', avatarUrl: null, bio: null } },
          { userId: 'u3', user: { id: 'u3', username: 'carol', displayName: 'Carol', avatarUrl: null, bio: null } },
          { userId: 'u4', user: { id: 'u4', username: 'dave', displayName: 'Dave', avatarUrl: null, bio: null } }
        ]
      } as never)
    })

    afterEach(() => {
      jest.useRealTimers()
    })

    it('shows reactor names on hover after the delay', () => {
      render(
        <ReactionPill
          reaction={reaction({ userIds: ['u1', 'u2', 'u3'], count: 3 })}
          messageId="msg-1"
          mode="channel"
          contextId="ch-1"
          onShowReactors={jest.fn()}
        />
      )

      fireEvent.pointerEnter(screen.getByRole('button').parentElement!, { pointerType: 'mouse' })
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()

      act(() => {
        jest.advanceTimersByTime(300)
      })

      const tip = screen.getByRole('tooltip')
      expect(tip).toHaveTextContent('reacted by')
      expect(tip).toHaveTextContent('Alice, Bob, Carol')
      expect(tip.querySelector('button')).toBeNull()
    })

    it('shows "and N others" link when more than 3 reactors and opens modal on click', () => {
      const onShow = jest.fn()
      render(
        <ReactionPill
          reaction={reaction({ emoji: '😂', userIds: ['u1', 'u2', 'u3', 'u4'], count: 4 })}
          messageId="msg-1"
          mode="channel"
          contextId="ch-1"
          onShowReactors={onShow}
        />
      )

      fireEvent.pointerEnter(screen.getByRole('button').parentElement!, { pointerType: 'mouse' })
      act(() => {
        jest.advanceTimersByTime(300)
      })

      const othersBtn = screen.getByRole('button', { name: /and 1 others/ })
      fireEvent.click(othersBtn)

      expect(onShow).toHaveBeenCalledWith('😂')
      expect(mockEmit).not.toHaveBeenCalled()
    })

    it('hides the tooltip when the pointer leaves (after the close delay)', () => {
      render(
        <ReactionPill
          reaction={reaction({ userIds: ['u1'], count: 1 })}
          messageId="msg-1"
          mode="channel"
          contextId="ch-1"
          onShowReactors={jest.fn()}
        />
      )

      const wrapper = screen.getByRole('button').parentElement!
      fireEvent.pointerEnter(wrapper, { pointerType: 'mouse' })
      act(() => {
        jest.advanceTimersByTime(300)
      })
      expect(screen.getByRole('tooltip')).toBeInTheDocument()

      fireEvent.pointerLeave(wrapper, { pointerType: 'mouse' })
      expect(screen.getByRole('tooltip')).toBeInTheDocument()

      act(() => {
        jest.advanceTimersByTime(200)
      })
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    })

    it('keeps the tooltip open when the pointer moves from the chip onto the tooltip', () => {
      render(
        <ReactionPill
          reaction={reaction({ emoji: '😂', userIds: ['u1', 'u2', 'u3', 'u4'], count: 4 })}
          messageId="msg-1"
          mode="channel"
          contextId="ch-1"
          onShowReactors={jest.fn()}
        />
      )

      const wrapper = screen.getByRole('button').parentElement!
      fireEvent.pointerEnter(wrapper, { pointerType: 'mouse' })
      act(() => {
        jest.advanceTimersByTime(300)
      })
      const tip = screen.getByRole('tooltip')
      expect(tip).toBeInTheDocument()

      fireEvent.pointerLeave(wrapper, { pointerType: 'mouse' })
      fireEvent.pointerEnter(tip)

      act(() => {
        jest.advanceTimersByTime(500)
      })

      expect(screen.getByRole('tooltip')).toBeInTheDocument()

      fireEvent.pointerLeave(tip)
      act(() => {
        jest.advanceTimersByTime(200)
      })
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    })
  })

  describe('mobile long-press', () => {
    beforeEach(() => {
      jest.useFakeTimers()
      mockIsMobile.mockReturnValue(true)
    })

    afterEach(() => {
      jest.useRealTimers()
    })

    it('opens the modal after a 500ms touchstart hold and swallows the click', () => {
      const onShow = jest.fn()
      render(
        <ReactionPill
          reaction={reaction({ emoji: '🎉', userIds: ['u1', 'u2'], count: 2 })}
          messageId="msg-1"
          mode="channel"
          contextId="ch-1"
          onShowReactors={onShow}
        />
      )

      const btn = screen.getByRole('button')

      fireEvent.touchStart(btn)
      act(() => {
        jest.advanceTimersByTime(500)
      })

      expect(onShow).toHaveBeenCalledWith('🎉')

      fireEvent.touchEnd(btn)
      fireEvent.click(btn)

      expect(mockEmit).not.toHaveBeenCalled()
    })

    it('cancels the long-press on touchmove', () => {
      const onShow = jest.fn()
      render(
        <ReactionPill
          reaction={reaction()}
          messageId="msg-1"
          mode="channel"
          contextId="ch-1"
          onShowReactors={onShow}
        />
      )

      const btn = screen.getByRole('button')
      fireEvent.touchStart(btn)
      act(() => {
        jest.advanceTimersByTime(200)
      })
      fireEvent.touchMove(btn)
      act(() => {
        jest.advanceTimersByTime(500)
      })

      expect(onShow).not.toHaveBeenCalled()
    })

    it('stops React touch events from bubbling so the row long-press does not also fire', () => {
      const rowTouchStart = jest.fn()
      const rowTouchEnd = jest.fn()
      const rowTouchMove = jest.fn()

      render(
        <div onTouchStart={rowTouchStart} onTouchEnd={rowTouchEnd} onTouchMove={rowTouchMove}>
          <ReactionPill
            reaction={reaction()}
            messageId="msg-1"
            mode="channel"
            contextId="ch-1"
            onShowReactors={jest.fn()}
          />
        </div>
      )

      const btn = screen.getByRole('button')
      fireEvent.touchStart(btn)
      fireEvent.touchMove(btn)
      fireEvent.touchEnd(btn)

      expect(rowTouchStart).not.toHaveBeenCalled()
      expect(rowTouchMove).not.toHaveBeenCalled()
      expect(rowTouchEnd).not.toHaveBeenCalled()
    })
  })
})
