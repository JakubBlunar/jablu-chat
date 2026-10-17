import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'
import type { Channel } from '@chat/shared'
import { TextChannelItem } from './TextChannelItem'
import { ForumChannelItem } from './ForumChannelItem'
import { computeChannelBadge } from '@/lib/unread'

jest.mock('@/lib/unread', () => {
  const actual = jest.requireActual<typeof import('@/lib/unread')>('@/lib/unread')
  return { ...actual, computeChannelBadge: jest.fn(actual.computeChannelBadge) }
})
jest.mock('@/stores/voice-connection.store', () => ({
  useVoiceConnectionStore: { getState: () => ({ setViewingVoiceRoom: jest.fn() }) }
}))

describe.each([
  ['text', TextChannelItem],
  ['forum', ForumChannelItem]
] as const)('%s channel rows', (type, ChannelItem) => {
  beforeEach(() => jest.clearAllMocks())

  function props() {
    const ch: Channel = { id: 'c1', serverId: 's1', name: 'general', type, position: 0, createdAt: '' }
    return {
      ch,
      active: false,
      readState: { unreadCount: 2, mentionCount: 1 },
      notifLevel: 'all' as const,
      longPressFired: { current: false },
      currentServer: { id: 's1' },
      orchestratedGoToChannel: jest.fn().mockResolvedValue(undefined),
      handleChannelTouchStart: jest.fn(),
      handleChannelTouchEnd: jest.fn(),
      handleChannelTouchMove: jest.fn(),
      handleChannelContextMenu: jest.fn()
    }
  }

  it('skips unchanged rows but updates badge, mute, and selection changes', () => {
    const initial = props()
    const { rerender } = render(<ChannelItem {...initial} />)
    expect(computeChannelBadge).toHaveBeenCalledTimes(1)
    expect(screen.getByText('1')).toBeInTheDocument()

    rerender(<ChannelItem {...initial} />)
    expect(computeChannelBadge).toHaveBeenCalledTimes(1)

    const readState = { unreadCount: 5, mentionCount: 3 }
    rerender(<ChannelItem {...initial} readState={readState} />)
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(computeChannelBadge).toHaveBeenCalledTimes(2)

    rerender(<ChannelItem {...initial} readState={readState} notifLevel="none" active />)
    expect(screen.queryByText('3')).not.toBeInTheDocument()
    expect(screen.getByRole('button')).toHaveClass('bg-surface-selected')
    expect(computeChannelBadge).toHaveBeenCalledTimes(3)
  })

  it('preserves navigation, long press suppression, and touch handlers', () => {
    const initial = props()
    render(<ChannelItem {...initial} />)
    const button = screen.getByRole('button')
    fireEvent.click(button)
    expect(initial.orchestratedGoToChannel).toHaveBeenCalledWith('s1', 'c1')

    initial.longPressFired.current = true
    fireEvent.click(button)
    expect(initial.orchestratedGoToChannel).toHaveBeenCalledTimes(1)
    expect(initial.longPressFired.current).toBe(false)

    fireEvent.touchStart(button)
    fireEvent.touchEnd(button)
    fireEvent.touchMove(button)
    fireEvent.contextMenu(button)
    expect(initial.handleChannelTouchStart).toHaveBeenCalledWith(initial.ch)
    expect(initial.handleChannelTouchEnd).toHaveBeenCalledTimes(1)
    expect(initial.handleChannelTouchMove).toHaveBeenCalledTimes(1)
    expect(initial.handleChannelContextMenu).toHaveBeenCalledTimes(1)
  })
})
