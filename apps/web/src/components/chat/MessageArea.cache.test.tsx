import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import React from 'react'
import type { Message } from '@chat/shared'
import { MessageArea } from './MessageArea'
import { channelKey, clearCache, putContext } from '@/lib/cache/messageCache'
import { useAuthStore } from '@/stores/auth.store'
import { useChannelStore } from '@/stores/channel.store'
import { useDmStore } from '@/stores/dm.store'
import { useMemberStore } from '@/stores/member.store'
import { useMessageStore } from '@/stores/message.store'
import { useServerStore } from '@/stores/server.store'
import { makeChannel, makeMessage, resetMsgSeq } from '@/test/factories'

/**
 * The one thing store-level tests cannot see is whether a spinner flashed.
 * This renders the real adapter against the real message store so a cache hit
 * has to be visible on the first paint, with the cold case alongside it to
 * prove the test can tell the two apart.
 */

jest.mock('@/components/chat/MessageSurface', () => ({
  // Stands in for the virtualised list: renders whatever it is handed, which
  // is either the messages or the empty/loading state MessageArea computed.
  MessageSurface: ({ messages, emptyState }: { messages: Message[]; emptyState?: React.ReactNode }) => (
    <div data-testid="surface">
      {messages.length === 0 && emptyState}
      {messages.map((m) => (
        <div key={m.id} data-testid="message">
          {m.content}
        </div>
      ))}
    </div>
  )
}))

jest.mock('@/components/chat/UnifiedInput', () => ({ UnifiedInput: () => null }))
jest.mock('@/components/chat/PinnedPanel', () => ({ PinnedPanel: () => null }))
jest.mock('@/components/chat/ThreadPanel', () => ({ ThreadPanel: () => null }))
jest.mock('@/components/chat/PollCreator', () => ({ PollCreator: () => null }))
jest.mock('@/components/chat/ChannelInfoPanel', () => ({ ChannelInfoPanel: () => null }))
jest.mock('@/components/chat/ChannelInfoDrawer', () => ({ ChannelInfoDrawer: () => null }))
jest.mock('@/components/dm/DmProfilePanel', () => ({ DmProfilePanel: () => null, UserProfileIcon: () => null }))
jest.mock('@/components/dm/FriendsPage', () => ({ FriendsPage: () => null }))
jest.mock('@/components/dm/DmInfoSheet', () => ({ DmInfoSheet: () => null }))
jest.mock('@/components/ProfileCard', () => ({ ProfileCard: () => null }))
jest.mock('@/components/channel/NotifBellMenu', () => ({ NotifBellMenu: () => null }))
jest.mock('@/components/notifications/InAppNotificationBell', () => ({ InAppNotificationBell: () => null }))
jest.mock('@/components/channel/EditChannelModal', () => ({ EditChannelModal: () => null }))
jest.mock('@/components/SearchBar', () => ({ SearchBar: () => null }))
jest.mock('@/components/search/SearchDrawer', () => ({ SearchDrawer: () => null }))

// The real component delays the spinner by 500ms; render it straight away so
// the test asserts on presence rather than on a timer.
jest.mock('@/components/DelayedRender', () => ({
  DelayedRender: ({ children }: { children: React.ReactNode }) => <>{children}</>
}))

jest.mock('@/components/ui', () => ({
  CountBadge: () => null,
  IconButton: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Spinner: () => <div data-testid="spinner" />
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
    handleJumpToMessage: jest.fn()
  })
}))

jest.mock('@/components/chat/hooks/useChannelAck', () => ({ useChannelAck: jest.fn() }))
jest.mock('@/components/chat/hooks/useProfileCard', () => ({
  useProfileCard: () => ({
    cardUser: null,
    cardRect: null,
    closeCard: jest.fn(),
    handleUserClick: jest.fn(),
    handleMentionClick: jest.fn()
  })
}))
jest.mock('@/components/chat/hooks/usePinnedMessages', () => ({
  usePinnedMessages: () => ({
    pinnedOpen: false,
    setPinnedOpen: jest.fn(),
    pinnedMessages: [],
    pinnedLoading: false,
    handleOpenPinned: jest.fn(),
    loadPinned: jest.fn()
  })
}))
jest.mock('@/components/chat/hooks/useTypingIndicators', () => ({
  useTypingIndicators: () => [],
  formatTyping: (names: string[]) => names.join(', ')
}))
jest.mock('@/components/chat/hooks/useReadReceipts', () => ({
  useReadReceipts: () => ({ lastOwnMsg: null, seenByLabel: null })
}))
jest.mock('@/components/dm/hooks/useDmContext', () => ({
  useDmContext: () => ({
    currentConv: null,
    otherMember: null,
    mutualServers: [],
    channelRefs: [],
    handleChannelClick: jest.fn()
  }),
  dmMentionChannels: () => []
}))

jest.mock('@/stores/layout.store', () => ({
  useLayoutStore: Object.assign(jest.fn(() => false), {
    getState: () => ({
      openNavDrawer: jest.fn(),
      closeChannelInfoDrawer: jest.fn(),
      toggleChannelInfoDrawer: jest.fn()
    }),
    setState: jest.fn(),
    subscribe: jest.fn()
  })
}))

jest.mock('@/stores/navigation.store', () => ({
  useNavigationStore: Object.assign(jest.fn(() => jest.fn()), {
    getState: () => ({ navigateToDm: jest.fn(), navigateToChannel: jest.fn() }),
    setState: jest.fn(),
    subscribe: jest.fn()
  })
}))

jest.mock('@/stores/thread.store', () => ({
  useThreadStore: Object.assign(
    jest.fn((selector: (s: { isOpen: boolean }) => unknown) => selector({ isOpen: false })),
    { getState: () => ({ isOpen: false }), setState: jest.fn(), subscribe: jest.fn() }
  )
}))

jest.mock('@/stores/channel-permissions.store', () => ({
  useChannelPermissionsStore: jest.fn(() => null)
}))

jest.mock('@/lib/api', () => ({
  api: { getGifEnabled: jest.fn().mockResolvedValue({ enabled: false }), updateProfile: jest.fn() },
  resolveMediaUrl: (p: string) => p
}))

jest.mock('@/lib/socket', () => ({ getSocket: () => ({ emit: jest.fn(), connected: true }) }))

function resetStores() {
  useAuthStore.setState({ user: { id: 'u1', username: 'testuser' } } as never)
  useServerStore.setState({ servers: [], currentServerId: 's1' } as never)
  useChannelStore.setState({ channels: [], currentChannelId: 'ch-1' } as never)
  useMemberStore.setState({ members: [] } as never)
  useDmStore.setState({ messagesError: null } as never)
  useMessageStore.setState({
    messages: [],
    isLoading: false,
    hasMore: false,
    hasNewer: false,
    messagesError: null,
    loadedForChannelId: null,
    typingUsers: new Map()
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  resetMsgSeq()
  clearCache(false)
  resetStores()
})

describe('MessageArea on a cache hit', () => {
  it('shows the cached messages on the first paint with no spinner', () => {
    putContext(channelKey('ch-1'), {
      messages: [
        makeMessage({ id: 'cached-1', channelId: 'ch-1', content: 'cached one' }),
        makeMessage({ id: 'cached-2', channelId: 'ch-1', content: 'cached two' })
      ],
      hasMore: false,
      hasNewer: false
    })

    useChannelStore.setState({
      channels: [makeChannel('ch-1', 's1')],
      currentChannelId: 'ch-1'
    } as never)

    // What navigation does before the route changes.
    useMessageStore.getState().hydrateFromCache('ch-1')

    render(<MessageArea mode="channel" contextId="ch-1" />)

    expect(screen.getAllByTestId('message')).toHaveLength(2)
    expect(screen.getByText('cached one')).toBeInTheDocument()
    expect(screen.queryByTestId('spinner')).not.toBeInTheDocument()
    expect(useMessageStore.getState().isLoading).toBe(false)
  })
})

describe('MessageArea on a cold context', () => {
  it('shows the spinner while the first page is loading', () => {
    useChannelStore.setState({
      channels: [makeChannel('ch-cold', 's1')],
      currentChannelId: 'ch-cold'
    } as never)
    useMessageStore.setState({ messages: [], isLoading: true, loadedForChannelId: null })

    render(<MessageArea mode="channel" contextId="ch-cold" />)

    expect(screen.getByTestId('spinner')).toBeInTheDocument()
    expect(screen.queryAllByTestId('message')).toHaveLength(0)
  })
})
