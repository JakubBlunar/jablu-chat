import '@testing-library/jest-dom'
import { act, render, screen } from '@testing-library/react'
import React from 'react'
import { MessageArea } from './MessageArea'
import { useDmStore } from '@/stores/dm.store'
import { useMessageStore } from '@/stores/message.store'
import { useAuthStore } from '@/stores/auth.store'
import { useServerStore } from '@/stores/server.store'
import { useChannelStore } from '@/stores/channel.store'
import { useMemberStore } from '@/stores/member.store'
import { useThreadStore } from '@/stores/thread.store'

// ── heavy sub-components ──────────────────────────────────────────────────────
jest.mock('@/components/chat/MessageSurface', () => ({ MessageSurface: () => null }))
jest.mock('@/components/chat/UnifiedInput', () => ({ UnifiedInput: () => null }))
jest.mock('@/components/chat/PinnedPanel', () => ({ PinnedPanel: () => null }))
jest.mock('@/components/chat/SavedMessagesPanel', () => ({ SavedMessagesPanel: () => null }))
jest.mock('@/components/chat/ThreadPanel', () => ({ ThreadPanel: () => null }))
jest.mock('@/components/chat/PollCreator', () => ({ PollCreator: () => null }))
jest.mock('@/components/chat/ChannelInfoSheet', () => ({ ChannelInfoSheet: () => null }))
jest.mock('@/components/dm/DmProfilePanel', () => ({
  DmProfilePanel: () => null,
  UserProfileIcon: () => null,
}))
jest.mock('@/components/dm/FriendsPage', () => ({ FriendsPage: () => <div data-testid="friends-page" /> }))
jest.mock('@/components/dm/DmInfoSheet', () => ({ DmInfoSheet: () => null }))
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
  IconButton: ({ children }: { children: React.ReactNode }) => <>{children}</>,
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
  }),
}))

jest.mock('@/hooks/useMobile', () => ({ useIsMobile: () => false }))
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
    currentConv: null,
    otherMember: null,
    mutualServers: [],
    channelRefs: [],
    handleChannelClick: jest.fn(),
  }),
  dmMentionChannels: () => [],
}))

jest.mock('@/stores/layout.store', () => ({
  useLayoutStore: Object.assign(jest.fn(() => jest.fn()), {
    getState: () => ({ openNavDrawer: jest.fn() }),
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
  resetStores()
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('MessageArea', () => {
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
