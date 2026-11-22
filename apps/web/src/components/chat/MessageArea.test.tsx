import '@testing-library/jest-dom'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import React from 'react'
import { MessageArea } from './MessageArea'
import { useDmStore } from '@/stores/dm.store'
import { useMessageStore } from '@/stores/message.store'
import { useAuthStore } from '@/stores/auth.store'
import { useServerStore } from '@/stores/server.store'
import { useChannelStore } from '@/stores/channel.store'
import { useMemberStore } from '@/stores/member.store'
import { ThreadPanel } from './ThreadPanel'
import { api } from '@/lib/api'
import { useVoiceConnectionStore } from '@/stores/voice-connection.store'
import { useChannelAck } from './hooks/useChannelAck'
import { MessageSurface } from './MessageSurface'
import { UnifiedInput } from './UnifiedInput'
import { useIsMobile } from '@/hooks/useMobile'
import { getIsStandalone } from '@/hooks/usePwaInstall'

// ── heavy sub-components ──────────────────────────────────────────────────────
jest.mock('simplebar-react', () => ({ children }: { children: React.ReactNode }) => <div>{children}</div>)
jest.mock('@/components/chat/MessageSurface', () => ({ MessageSurface: jest.fn(() => <div data-testid="messages" />) }))
jest.mock('@/components/chat/UnifiedInput', () => ({ UnifiedInput: jest.fn(() => <textarea aria-label="Message" />) }))
jest.mock('@/components/chat/PinnedPanel', () => ({ PinnedPanel: () => null }))
jest.mock('@/components/chat/PinnedMessagesList', () => ({ PinnedMessagesList: () => null }))
jest.mock('@/components/channel/ChannelMediaGrid', () => ({ ChannelMediaGrid: () => null }))
jest.mock('@/components/channel/ChannelFilesList', () => ({ ChannelFilesList: () => null }))
jest.mock('@/components/chat/ThreadPanel', () => ({ ThreadPanel: jest.fn(() => null) }))
jest.mock('@/components/chat/PollCreator', () => ({ PollCreator: () => null }))
jest.mock('@/components/chat/ChannelInfoDrawer', () => ({ ChannelInfoDrawer: () => null }))
jest.mock('@/components/dm/DmProfilePanel', () => ({
  DmProfilePanel: () => null,
  UserProfileIcon: () => null,
}))
jest.mock('@/components/dm/FriendsPage', () => ({ FriendsPage: () => <div data-testid="friends-page" /> }))
jest.mock('@/components/dm/ConversationActions', () => ({ ConversationActions: () => null }))
jest.mock('@/components/media/AttachmentBrowser', () => ({ AttachmentBrowser: () => null }))
jest.mock('@/components/dm/DmCallButton', () => ({ DmCallButton: () => null }))
jest.mock('@/components/dm/DmCallInvitation', () => ({ DmCallInvitation: () => null }))
jest.mock('@/components/voice/VoiceRoom', () => ({ VoiceRoom: () => <div>Active call</div> }))
jest.mock('@/stores/voice-connection.store', () => ({
  useVoiceConnectionStore: jest.fn()
}))
jest.mock('@/components/ProfileCard', () => ({ ProfileCard: () => null }))
jest.mock('@/components/channel/NotifBellMenu', () => ({ NotifBellMenu: () => null }))
jest.mock('@/components/notifications/InAppNotificationBell', () => ({ InAppNotificationBell: () => null }))
jest.mock('@/components/channel/EditChannelModal', () => ({ EditChannelModal: () => null }))
jest.mock('@/components/SearchBar', () => ({ SearchBar: () => null }))
jest.mock('@/components/search/SearchDrawer', () => ({ SearchDrawer: () => null }))
jest.mock('@/components/DelayedRender', () => ({
  DelayedRender: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))
jest.mock('@/components/ui', () => ({
  CountBadge: () => null,
  IconButton: jest.requireActual('@/components/ui/IconButton').IconButton,
  Spinner: () => null,
}))

// ── custom hooks ──────────────────────────────────────────────────────────────
jest.mock('@/hooks/useMessageStoreAdapter', () => ({
  useMessageStoreAdapter: () => ({
    messages: [],
    isLoading: false,
    hasMore: false,
    hasNewer: false,
    fetchMessages: jest.fn(),
    fetchNewer: jest.fn(),
    reset: jest.fn(),
    getLoadedForId: () => 'conv-1',
  }),
}))

jest.mock('@/hooks/useMobile', () => ({ useIsMobile: jest.fn(() => false) }))
jest.mock('@/hooks/usePwaInstall', () => ({ getIsStandalone: jest.fn(() => false), getIsMobileDevice: () => true }))
jest.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ has: () => false }), Permission: {} }))

jest.mock('@/components/chat/hooks/useMessageScroll', () => ({
  useMessageScroll: () => ({
    scrollParentRef: { current: null },
    topSentinelRef: { current: null },
    bottomSentinelRef: { current: null },
    newerSentinelRef: { current: null },
    atBottom: true,
    settling: false,
    stickToBottom: jest.fn(),
    handleBottomButtonClick: jest.fn(),
    handleJumpToMessage: jest.fn(),
  }),
}))

jest.mock('@/components/chat/hooks/useChannelAck', () => ({
  useChannelAck: jest.fn(),
}))

jest.mock('@/components/chat/hooks/useProfileCard', () => ({
  useProfileCard: () => ({
    cardUser: null,
    cardRect: null,
    closeCard: jest.fn(),
    handleUserClick: jest.fn(),
    handleMentionClick: jest.fn(),
  }),
}))

jest.mock('@/components/chat/hooks/usePinnedMessages', () => ({
  usePinnedMessages: () => ({
    pinnedOpen: false,
    setPinnedOpen: jest.fn(),
    pinnedMessages: [],
    pinnedLoading: false,
    handleOpenPinned: jest.fn(),
    loadPinned: jest.fn(),
  }),
}))

jest.mock('@/components/chat/hooks/useTypingIndicators', () => ({
  useTypingIndicators: () => [],
  formatTyping: (names: string[]) => `${names.join(', ')} is typing…`,
}))

jest.mock('@/components/chat/hooks/useReadReceipts', () => ({
  useReadReceipts: () => ({ lastOwnMsg: null, seenByLabel: null }),
}))

jest.mock('@/components/dm/hooks/useDmContext', () => ({
  useDmContext: () => ({
    currentConv: { id: 'conv-1', isGroup: false, members: [] },
    otherMember: null,
    mutualServers: [],
    channelRefs: [],
    handleChannelClick: jest.fn(),
  }),
  dmMentionChannels: () => [],
}))

jest.mock('@/stores/layout.store', () => ({
  useLayoutStore: Object.assign(jest.fn(() => false), {
    getState: () => ({
      openNavDrawer: jest.fn(),
      closeChannelInfoDrawer: jest.fn(),
      toggleChannelInfoDrawer: jest.fn(),
    }),
    setState: jest.fn(),
    subscribe: jest.fn(),
  }),
}))

jest.mock('@/stores/navigation.store', () => ({
  useNavigationStore: Object.assign(jest.fn(() => jest.fn()), {
    getState: () => ({ navigateToDm: jest.fn(), navigateToChannel: jest.fn() }),
    setState: jest.fn(),
    subscribe: jest.fn(),
  }),
}))

jest.mock('@/stores/thread.store', () => ({
  useThreadStore: Object.assign(jest.fn((selector: (s: { isOpen: boolean }) => unknown) => selector({ isOpen: false })), {
    getState: () => ({ isOpen: false }),
    setState: jest.fn(),
    subscribe: jest.fn(),
  }),
}))

jest.mock('@/stores/channel-permissions.store', () => ({
  useChannelPermissionsStore: jest.fn(() => null),
}))

jest.mock('@/lib/api', () => ({
  api: {
    getGifEnabled: jest.fn().mockResolvedValue({ enabled: false }),
    updateProfile: jest.fn(),
    patch: jest.fn(),
  },
  resolveMediaUrl: (p: string) => p,
}))

// ── shared helpers ────────────────────────────────────────────────────────────

function resetStores() {
  useAuthStore.setState({ user: { id: 'u1', username: 'testuser', displayName: null, avatarUrl: null, email: 'test@test.com', createdAt: '' } } as any)
  useServerStore.setState({ servers: [], currentServerId: 's1' } as any)
  useChannelStore.setState({ channels: [], currentChannelId: 'ch-1' } as any)
  useMemberStore.setState({ members: [] } as any)
  useDmStore.setState({ messagesError: null } as any)
  useMessageStore.setState({ messagesError: null } as any)
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(useVoiceConnectionStore).mockImplementation((selector: any) => selector({
    currentDmCallId: null, currentChannelId: null, viewingVoiceRoom: false
  }))
  resetStores()
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('MessageArea', () => {
  describe('mobile conversation details', () => {
    const swipe = (target: HTMLElement, x: number, dx: number, dy = 0) => {
      fireEvent.touchStart(target, { touches: [{ clientX: x, clientY: 100 }] })
      fireEvent.touchEnd(target, { changedTouches: [{ clientX: x + dx, clientY: 100 + dy }] })
    }

    beforeEach(() => {
      jest.mocked(useIsMobile).mockReturnValue(true)
      useServerStore.setState({ servers: [{ id: 's1', name: 'Server' }] } as any)
      useChannelStore.setState({ channels: [{ id: 'ch-1', serverId: 's1', name: 'general', type: 'text' }] } as any)
    })
    afterEach(() => {
      jest.mocked(useIsMobile).mockReturnValue(false)
      jest.mocked(getIsStandalone).mockReturnValue(false)
    })

    it('opens Members from the right edge, closes on a right swipe and reopens on Members from the header', async () => {
      jest.mocked(getIsStandalone).mockReturnValue(true)
      render(<MessageArea mode="channel" contextId="ch-1" />)
      const history = screen.getByTestId('messages')
      const edge = window.innerWidth - 32
      swipe(history, edge - 120, -90)
      swipe(history, edge, -80, 120)
      expect(screen.queryByRole('dialog')).toBeNull()
      swipe(history, edge, -80)
      const panel = within(await screen.findByRole('dialog', { name: 'general' }))
      expect(panel.getByRole('button', { name: 'channelInfoTabMembers' })).toHaveAttribute('aria-pressed', 'true')
      fireEvent.click(panel.getByRole('button', { name: 'channelInfoTabInfo' }))
      swipe(panel.getByRole('heading', { name: /general/ }), 100, 80)
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
      fireEvent.click(screen.getByRole('button', { name: 'general' }))
      expect(screen.getByRole('button', { name: 'channelInfoTabMembers' })).toHaveAttribute('aria-pressed', 'true')
      fireEvent.click(screen.getByRole('button', { name: /close/i }))
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    })

    it('keeps the tap-open info sheet in a mobile browser tab', () => {
      render(<MessageArea mode="channel" contextId="ch-1" />)
      swipe(screen.getByTestId('messages'), window.innerWidth - 32, -80)
      expect(screen.queryByRole('dialog')).toBeNull()
      fireEvent.click(screen.getByRole('button', { name: 'general' }))
      expect(screen.getByRole('button', { name: 'channelInfoTabInfo' })).toHaveAttribute('aria-pressed', 'true')
    })

    it.each([true, false])('handles the DM details edge in standalone mode %s', async (standalone) => {
      jest.mocked(getIsStandalone).mockReturnValue(standalone)
      render(<MessageArea mode="dm" contextId="conv-1" />)
      const history = screen.getByTestId('messages')
      const edge = window.innerWidth - 64
      fireEvent.touchStart(history, { touches: [{ clientX: edge, clientY: 100 }] })
      const allowedPan = fireEvent.touchMove(history, { touches: [{ clientX: edge - 4, clientY: 101 }] })
      expect(allowedPan).toBe(!standalone)
      fireEvent.touchMove(history, { touches: [{ clientX: edge - 95, clientY: 103 }] })
      // A committed swipe can curl back before the finger lifts.
      const allowedDefault = fireEvent.touchEnd(history, { changedTouches: [{ clientX: edge - 42, clientY: 113 }] })
      expect(allowedDefault).toBe(!standalone)
      if (standalone) {
        const panel = within(await screen.findByRole('dialog', { name: 'conversationInfo' }))
        expect(panel.getByRole('tab', { selected: true })).toHaveTextContent('profileTitle')
        swipe(panel.getByRole('heading'), 100, 90)
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
      } else expect(screen.queryByRole('dialog')).toBeNull()
    })
  })

  it('switches DM panel tabs and closes the active tab on a second click', () => {
    render(<MessageArea mode="dm" contextId="conv-1" />)
    const pins = screen.getByRole('button', { name: 'pinnedMessagesTitle' })
    const info = screen.getByRole('button', { name: 'conversationInfo' })
    fireEvent.click(pins)
    expect(pins).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(info)
    expect(info).toHaveAttribute('aria-expanded', 'true')
    expect(pins).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(info)
    expect(info).toHaveAttribute('aria-expanded', 'false')
  })

  it('includes DM history in the composer drop zone', () => {
    render(<MessageArea mode="dm" contextId="conv-1" />)

    const composer = jest.mocked(UnifiedInput).mock.lastCall?.[0]
    expect(composer).toMatchObject({ mode: 'dm', contextId: 'conv-1' })
    expect(composer?.dropZoneRef?.current).toContainElement(screen.getByTestId('messages'))
  })

  it('shows the matching DM conversation below a call and toggles chat without losing its draft', async () => {
    jest.mocked(useVoiceConnectionStore).mockImplementation((selector: any) => selector({
      currentDmCallId: 'call', currentChannelId: 'conv-1', viewingVoiceRoom: true
    }))
    render(<MessageArea mode="dm" contextId="conv-1" />)
    await screen.findByText('Active call')
    const composer = screen.getByRole('textbox', { name: 'Message' })
    fireEvent.change(composer, { target: { value: 'Message during a call' } })
    expect(jest.mocked(MessageSurface).mock.calls.at(-1)?.[0]).toMatchObject({ mode: 'dm', contextId: 'conv-1' })
    expect(jest.mocked(UnifiedInput).mock.calls.at(-1)?.[0]).toMatchObject({ mode: 'dm', contextId: 'conv-1' })
    expect(jest.mocked(useChannelAck).mock.calls.at(-1)?.[2]).toMatchObject({ ready: true, callChatVisible: true })
    fireEvent.click(screen.getByRole('button', { name: 'hideCallChat' }))
    expect(composer).not.toBeVisible()
    expect(screen.getByText('Active call')).toBeVisible()
    expect(jest.mocked(useChannelAck).mock.calls.at(-1)?.[2]).toMatchObject({ ready: false, callChatVisible: false })
    fireEvent.click(screen.getByRole('button', { name: 'showCallChat' }))
    expect(screen.getByRole('textbox')).toBe(composer)
    expect(composer).toHaveValue('Message during a call')
    expect(composer).toBeVisible()
  })

  it('does not put the active call above another DM conversation', () => {
    jest.mocked(useVoiceConnectionStore).mockImplementation((selector: any) => selector({
      currentDmCallId: 'call', currentChannelId: 'other-dm', viewingVoiceRoom: true
    }))
    render(<MessageArea mode="dm" contextId="conv-1" />)
    expect(screen.queryByText('Active call')).not.toBeInTheDocument()
    expect(screen.queryByRole('separator')).not.toBeInTheDocument()
    expect(screen.getByRole('textbox')).toBeVisible()
  })

  it('uses /nick to update the server profile rather than the global profile', async () => {
    jest.mocked(api.patch).mockResolvedValue({ displayName: 'Server name', bio: null })
    render(<MessageArea mode="channel" contextId="ch-1" />)
    const onCommand = jest.mocked(ThreadPanel).mock.calls.at(-1)?.[0].onCommand
    if (!onCommand) throw new Error('Missing thread command handler')
    await act(async () => { onCommand('nick', 'Server name') })
    expect(api.patch).toHaveBeenCalledWith('/api/servers/s1/members/u1/profile', { displayName: 'Server name' })
    expect(api.updateProfile).not.toHaveBeenCalled()
    expect(useAuthStore.getState().user?.displayName).toBeNull()
  })

  describe('hooks are always called unconditionally', () => {
    it('renders in channel mode without throwing', () => {
      expect(() =>
        render(<MessageArea mode="channel" contextId="ch-1" />)
      ).not.toThrow()
    })

    it('renders in dm mode without throwing', () => {
      expect(() =>
        render(<MessageArea mode="dm" contextId="conv-1" />)
      ).not.toThrow()
    })

    it('switching mode does not cause hook-order error', async () => {
      const { rerender } = render(<MessageArea mode="channel" contextId="ch-1" />)
      await act(async () => {
        rerender(<MessageArea mode="dm" contextId="conv-1" />)
      })
      // If hooks were called conditionally, React would throw here.
    })
  })

  describe('aria-live typing indicator', () => {
    it('renders no text node when no one is typing', () => {
      const { container } = render(<MessageArea mode="channel" contextId="ch-1" />)
      const liveRegion = container.querySelector('[aria-live="polite"]')
      expect(liveRegion).not.toBeNull()
      expect(liveRegion?.textContent).toBe('')
    })
  })

  describe('no contextId', () => {
    it('renders FriendsPage in DM mode when there is no contextId', () => {
      render(<MessageArea mode="dm" contextId={null} />)
      expect(screen.getByTestId('friends-page')).toBeInTheDocument()
    })
  })

  describe('gif feature flag', () => {
    it('does not call api.getGifEnabled directly (fetched via gif.store at app boot)', () => {
      const { api: mockApi } = jest.requireMock('@/lib/api')
      render(<MessageArea mode="channel" contextId="ch-1" />)
      // getGifEnabled is now the responsibility of gif.store / MainLayout, not MessageArea
      expect(mockApi.getGifEnabled).not.toHaveBeenCalled()
    })
  })
})
