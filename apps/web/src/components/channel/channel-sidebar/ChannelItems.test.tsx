import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'
import type { Channel } from '@chat/shared'
import { TextChannelItem } from './TextChannelItem'
import { ForumChannelItem } from './ForumChannelItem'
import { computeChannelBadge } from '@/lib/unread'

jest.mock('@/hooks/useMobile', () => ({ useIsMobile: () => false }))

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
      currentServer: { id: 's1' },
      goToChannel: jest.fn().mockResolvedValue(undefined)
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

  it('opens options without navigating and preserves normal click navigation', () => {
    const initial = props()
    render(<ChannelItem {...initial} />)
    const button = screen.getByRole('button')
    fireEvent.contextMenu(button)
    expect(screen.getByRole('menu', { name: 'general' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'markAsRead' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'voice.editChannel' })).not.toBeInTheDocument()
    expect(initial.goToChannel).not.toHaveBeenCalled()
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    fireEvent.click(button)
    expect(initial.goToChannel).toHaveBeenCalledWith('s1', 'c1')
  })
})
