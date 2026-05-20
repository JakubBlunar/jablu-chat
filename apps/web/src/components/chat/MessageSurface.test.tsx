import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { MessageSurface, type MessageSurfaceProps } from './MessageSurface'
import type { ScrollState } from './hooks/useMessageScroll'
import { makeMessages, resetMsgSeq } from '@/test/factories'
import React from 'react'

jest.mock('@/components/chat/MessageRow', () => ({
  MessageRow: ({ message }: { message: { id: string; content: string | null } }) => (
    <div data-testid={`msg-${message.id}`}>{message.content}</div>
  )
}))

jest.mock('@/components/ScrollToBottomButton', () => ({
  ScrollToBottomButton: () => null
}))

jest.mock('@/lib/format-time', () => ({
  formatDateSeparator: (d: string) => `DATE:${d}`,
  formatTimeOnly: (d: string) => `TIME:${d}`,
  isDifferentDay: () => false
}))

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { count?: number; time?: string }) => {
      if (key === 'newMessagesDivider') return 'New Messages'
      if (key === 'newMessagesPill') {
        return `${opts?.count ?? 0} new since ${opts?.time ?? ''}`
      }
      if (key === 'markAsRead') return 'Mark As Read'
      return key
    }
  })
}))

function makeScroll(overrides: Partial<ScrollState> = {}): ScrollState {
  return {
    scrollParentRef: React.createRef<HTMLDivElement>(),
    topSentinelRef: React.createRef<HTMLDivElement>(),
    bottomSentinelRef: React.createRef<HTMLDivElement>(),
    newerSentinelRef: React.createRef<HTMLDivElement>(),
    atBottom: true,
    settling: false,
    stickToBottom: jest.fn(),
    handleBottomButtonClick: jest.fn(),
    handleJumpToMessage: jest.fn(),
    ...overrides
  }
}

function renderSurface(overrides: Partial<MessageSurfaceProps> = {}) {
  const defaultProps: MessageSurfaceProps = {
    scroll: makeScroll(),
    messages: [],
    isLoading: false,
    hasMore: false,
    hasNewer: false,
    mode: 'channel',
    contextId: 'ch-1',
    onReply: jest.fn(),
    ...overrides
  }
  return render(<MessageSurface {...defaultProps} />)
}

beforeEach(() => {
  resetMsgSeq()
})

describe('MessageSurface', () => {
  it('renders empty state when provided', () => {
    renderSurface({ emptyState: <div data-testid="empty">No messages yet</div> })
    expect(screen.getByTestId('empty')).toBeInTheDocument()
  })

  it('renders messages', () => {
    const msgs = makeMessages(3)
    renderSurface({ messages: msgs })
    for (const msg of msgs) {
      expect(screen.getByTestId(`msg-${msg.id}`)).toBeInTheDocument()
    }
  })

  it('renders loading spinner only when loading with no messages', () => {
    const { container } = renderSurface({ isLoading: true, messages: [] })
    expect(container.querySelector('.animate-spin')).not.toBeNull()
  })

  it('does not render spinner when loading with existing messages (pagination)', () => {
    const { container } = renderSurface({ isLoading: true, messages: makeMessages(3) })
    expect(container.querySelector('.animate-spin')).toBeNull()
  })

  it('renders headerContent at the visual top', () => {
    renderSurface({
      messages: makeMessages(2),
      headerContent: <div data-testid="header">Root Post</div>
    })
    expect(screen.getByTestId('header')).toBeInTheDocument()
  })

  it('renders seenByLabel for last own message', () => {
    const msgs = makeMessages(2)
    renderSurface({
      messages: msgs,
      lastOwnMsgId: msgs[1].id,
      seenByLabel: 'Seen by Alice'
    })
    expect(screen.getByText('Seen by Alice')).toBeInTheDocument()
  })

  it('applies invisible class when settling', () => {
    const { container } = renderSurface({
      scroll: makeScroll({ settling: true }),
      messages: makeMessages(2)
    })
    const scrollContainer = container.querySelector('.chat-scroll')
    expect(scrollContainer?.className).toContain('invisible')
  })

  it('does not apply invisible class when not settling', () => {
    const { container } = renderSurface({
      scroll: makeScroll({ settling: false }),
      messages: makeMessages(2)
    })
    const scrollContainer = container.querySelector('.chat-scroll')
    expect(scrollContainer?.className).not.toContain('invisible')
  })

  it('renders messages in chronological DOM order (oldest first, newest last)', () => {
    const msgs = makeMessages(3)
    const { container } = renderSurface({ messages: msgs })
    const renderedIds = Array.from(container.querySelectorAll('[data-testid^="msg-"]')).map(
      (el) => el.getAttribute('data-testid')
    )
    expect(renderedIds).toEqual([`msg-${msgs[0].id}`, `msg-${msgs[1].id}`, `msg-${msgs[2].id}`])
  })

  it('scroll container disables browser scroll anchoring and is not flex-col-reverse', () => {
    const { container } = renderSurface({ messages: makeMessages(2) })
    const scrollContainer = container.querySelector('.chat-scroll')
    expect(scrollContainer).not.toBeNull()
    expect(scrollContainer?.className).not.toContain('flex-col-reverse')
    expect(scrollContainer?.className).toMatch(/overflow-anchor/)
  })

  describe('new messages indicator', () => {
    beforeEach(() => {
      // jsdom doesn't implement IntersectionObserver
      class FakeObserver {
        observe() {}
        disconnect() {}
        unobserve() {}
      }
      // @ts-expect-error - jsdom shim
      global.IntersectionObserver = FakeObserver
    })

    it('renders divider above firstUnreadId message', () => {
      const msgs = makeMessages(3)
      renderSurface({
        messages: msgs,
        firstUnreadId: msgs[1].id,
        unreadCount: 2,
        unreadSince: '2025-01-01T10:00:00Z'
      })
      expect(screen.getByTestId('new-messages-divider')).toBeInTheDocument()
    })

    it('does not render divider when firstUnreadId is null', () => {
      const msgs = makeMessages(3)
      renderSurface({ messages: msgs, firstUnreadId: null, unreadCount: 0 })
      expect(screen.queryByTestId('new-messages-divider')).not.toBeInTheDocument()
    })

    it('does not render divider when firstUnreadId is not in the rendered list', () => {
      const msgs = makeMessages(3)
      renderSurface({ messages: msgs, firstUnreadId: 'missing-id', unreadCount: 2 })
      expect(screen.queryByTestId('new-messages-divider')).not.toBeInTheDocument()
    })

    it('renders the pill when divider is in the list', () => {
      const msgs = makeMessages(3)
      renderSurface({
        messages: msgs,
        firstUnreadId: msgs[1].id,
        unreadCount: 2,
        unreadSince: '2025-01-01T10:00:00Z'
      })
      const pill = screen.getByTestId('new-messages-pill')
      expect(pill).toBeInTheDocument()
      expect(pill.textContent).toContain('2 new')
      expect(pill.textContent).toContain('TIME:2025-01-01T10:00:00Z')
    })

    it('does not render pill when unreadCount is 0', () => {
      const msgs = makeMessages(3)
      renderSurface({ messages: msgs, firstUnreadId: msgs[1].id, unreadCount: 0 })
      expect(screen.queryByTestId('new-messages-pill')).not.toBeInTheDocument()
    })

    it('invokes onJumpToUnread when pill body is clicked', () => {
      const msgs = makeMessages(3)
      const onJump = jest.fn()
      renderSurface({
        messages: msgs,
        firstUnreadId: msgs[1].id,
        unreadCount: 2,
        unreadSince: '2025-01-01T10:00:00Z',
        onJumpToUnread: onJump
      })
      screen.getByTestId('new-messages-pill').click()
      expect(onJump).toHaveBeenCalledTimes(1)
    })

    it('invokes onMarkAsRead when Mark As Read is clicked (without bubbling to jump)', () => {
      const msgs = makeMessages(3)
      const onJump = jest.fn()
      const onMark = jest.fn()
      renderSurface({
        messages: msgs,
        firstUnreadId: msgs[1].id,
        unreadCount: 2,
        unreadSince: '2025-01-01T10:00:00Z',
        onJumpToUnread: onJump,
        onMarkAsRead: onMark
      })
      const mark = screen.getByText('Mark As Read')
      mark.click()
      expect(onMark).toHaveBeenCalledTimes(1)
      expect(onJump).not.toHaveBeenCalled()
    })
  })

  describe('accessibility', () => {
    it('scroll container has role="log"', () => {
      const { container } = renderSurface()
      const scrollContainer = container.querySelector('.chat-scroll')
      expect(scrollContainer).toHaveAttribute('role', 'log')
    })

    it('scroll container has aria-label="Messages"', () => {
      const { container } = renderSurface()
      const scrollContainer = container.querySelector('.chat-scroll')
      expect(scrollContainer).toHaveAttribute('aria-label', 'Messages')
    })

    it('scroll container has aria-live="polite"', () => {
      const { container } = renderSurface()
      const scrollContainer = container.querySelector('.chat-scroll')
      expect(scrollContainer).toHaveAttribute('aria-live', 'polite')
    })
  })
})
