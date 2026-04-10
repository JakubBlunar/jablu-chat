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
  isDifferentDay: () => false
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

  describe('accessibility', () => {
    it('scroll container has role="region"', () => {
      const { container } = renderSurface()
      const scrollContainer = container.querySelector('.chat-scroll')
      expect(scrollContainer).toHaveAttribute('role', 'region')
    })

    it('scroll container has translated aria-label for message list', () => {
      const { container } = renderSurface()
      const scrollContainer = container.querySelector('.chat-scroll')
      expect(scrollContainer).toHaveAttribute('aria-label', 'messageListLabel')
    })
  })
})
