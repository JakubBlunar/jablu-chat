import { act, renderHook } from '@testing-library/react'
import { useSocket } from './useSocket'
import { channelKey, clearCache, dmKey, peekContext, putContext } from '@/lib/cache/messageCache'
import type { AppVisibilityState } from '@/lib/appVisibility'

let mockVisibility: AppVisibilityState = { visibility: 'visible', focused: true }
let mockVisibilityListener: ((state: AppVisibilityState) => void) | undefined
const mockUnsubscribeVisibility = jest.fn()
jest.mock('@/lib/appVisibility', () => ({
  getAppVisibilityState: () => mockVisibility,
  subscribeAppVisibility: (listener: typeof mockVisibilityListener) => {
    mockVisibilityListener = listener
    return mockUnsubscribeVisibility
  }
}))

const mockListeners = new Map<string, () => void>()
const mockSocket = {
  connected: false,
  emit: jest.fn(),
  on: jest.fn((event: string, handler: () => void) => {
    if (typeof handler === 'function') mockListeners.set(event, handler)
  }),
  off: jest.fn(),
  disconnect: jest.fn(),
  connect: jest.fn()
}
const mockAuth = { accessToken: 'token', user: { id: 'user' } }
const mockNavigation = { isNavigating: false }
jest.mock('@/stores/navigation.store', () => ({
  useNavigationStore: { getState: () => mockNavigation }
}))
const mockMessages = {
  loadedForChannelId: null as string | null,
  messages: [] as { id: string }[],
  isLoading: false,
  hasNewer: false,
  fetchMessages: jest.fn(async () => {}),
  fetchNewerMessages: jest.fn(async () => {})
}
const mockDm = {
  ...mockMessages,
  currentConversationId: 'dm',
  loadedForConvId: null as string | null,
  fetchConversations: jest.fn(async () => {}),
  fetchMessages: jest.fn(async () => {}),
  fetchNewerMessages: jest.fn(async () => {})
}

jest.mock('@/lib/api', () => ({ api: {} }))
jest.mock('@/lib/notifications', () => ({ clearNotifications: jest.fn() }))
jest.mock('@/lib/socket', () => ({
  connectSocket: () => mockSocket,
  disconnectSocket: jest.fn(),
  getSocket: () => mockSocket
}))
jest.mock('@/lib/messageOutbox', () => ({ startMessageOutbox: jest.fn() }))
jest.mock('@/stores/auth.store', () => ({
  useAuthStore: Object.assign((selector: (state: typeof mockAuth) => unknown) => selector(mockAuth), {
    getState: () => mockAuth
  })
}))
jest.mock('@/stores/channel.store', () => ({
  useChannelStore: { getState: () => ({ currentChannelId: 'channel' }) }
}))
jest.mock('@/stores/message.store', () => ({ useMessageStore: { getState: () => mockMessages } }))
jest.mock('@/stores/dm.store', () => ({ useDmStore: { getState: () => mockDm } }))
jest.mock('@/stores/toast.store', () => ({ showToast: jest.fn() }))
jest.mock('@/stores/channel-permissions.store', () => ({ useChannelPermissionsStore: {} }))
jest.mock('@/stores/member.store', () => ({ useMemberStore: {} }))
jest.mock('@/stores/server.store', () => ({
  useServerStore: { getState: () => ({ fetchServers: jest.fn(async () => {}) }) }
}))
jest.mock('@/stores/readState.store', () => ({
  useReadStateStore: { getState: () => ({ fetchAll: jest.fn() }) }
}))
jest.mock('@/stores/notificationCenter.store', () => ({
  useNotificationCenterStore: { getState: () => ({ fetchUnread: jest.fn() }) }
}))
jest.mock('@/stores/voice-connection.store', () => ({
  useVoiceConnectionStore: { getState: () => ({}) }
}))
jest.mock('@/stores/dmCall.store', () => ({
  useDmCallStore: { getState: () => ({ sync: jest.fn(), reset: jest.fn() }) }
}))
jest.mock('./socket/channelHandlers', () => ({ createChannelHandlers: () => ({}) }))
jest.mock('./socket/dmHandlers', () => ({ createDmHandlers: () => ({}) }))
jest.mock('./socket/presenceHandlers', () => ({ createPresenceHandlers: () => ({ cleanup: jest.fn() }) }))
jest.mock('./socket/serverHandlers', () => ({ createServerHandlers: () => ({}) }))
jest.mock('./socket/voiceHandlers', () => ({ createVoiceHandlers: () => ({}) }))

describe('useSocket message recovery', () => {
  it.each(['connect', 'resume'])('does not overwrite a prefetched destination during navigation on %s', (event) => {
    mockNavigation.isNavigating = true
    mockVisibility = { visibility: 'hidden', focused: false }
    mockSocket.connected = true
    Object.assign(mockMessages, { loadedForChannelId: 'next-channel', messages: [{ id: 'destination' }] })
    const { unmount } = renderHook(() => useSocket())
    try {
      act(() => {
        if (event === 'connect') mockListeners.get('connect')!()
        else mockVisibilityListener!({ visibility: 'visible', focused: true })
      })
      expect(mockMessages.fetchMessages).not.toHaveBeenCalled()
      expect(mockMessages.fetchNewerMessages).not.toHaveBeenCalled()
      expect(mockDm.fetchMessages).not.toHaveBeenCalled()
    } finally {
      mockNavigation.isNavigating = false
      unmount()
    }
  })

  beforeEach(() => {
    jest.clearAllMocks()
    mockListeners.clear()
    clearCache(false)
    mockVisibility = { visibility: 'visible', focused: true }
    mockVisibilityListener = undefined
    mockSocket.connected = false
    Object.assign(mockMessages, { loadedForChannelId: null, messages: [], isLoading: false, hasNewer: false })
    Object.assign(mockDm, { loadedForConvId: null, messages: [], isLoading: false, hasNewer: false })
  })

  it.each(['disconnect', 'connect'])('marks background channel and DM caches stale on %s', (event) => {
    putContext(channelKey('background'), { messages: [], hasMore: false, hasNewer: false })
    putContext(dmKey('background'), { messages: [], hasMore: false, hasNewer: false })
    renderHook(() => useSocket())
    act(() => mockListeners.get(event)!())
    expect(peekContext(channelKey('background'))?.stale).toBe(true)
    expect(peekContext(dmKey('background'))?.stale).toBe(true)
  })

  it('catches up on native tray restore even when the document stays visible', () => {
    mockVisibility = { visibility: 'hidden', focused: false }
    mockSocket.connected = true
    Object.assign(mockMessages, { loadedForChannelId: 'channel', messages: [{ id: 'existing' }] })
    Object.assign(mockDm, { loadedForConvId: 'dm', messages: [{ id: 'existing' }] })
    putContext(channelKey('background'), { messages: [], hasMore: false, hasNewer: false })
    const { unmount } = renderHook(() => useSocket())
    act(() => mockVisibilityListener!({ visibility: 'visible', focused: false }))
    act(() => mockVisibilityListener!({ visibility: 'visible', focused: true }))
    expect(mockMessages.fetchNewerMessages).toHaveBeenCalledTimes(1)
    expect(mockDm.fetchNewerMessages).toHaveBeenCalledTimes(1)
    expect(peekContext(channelKey('background'))?.stale).toBe(true)
    unmount()
    expect(mockUnsubscribeVisibility).toHaveBeenCalledTimes(1)
  })

  it('reconnects on native tray restore when the socket is disconnected', () => {
    mockVisibility = { visibility: 'hidden', focused: false }
    renderHook(() => useSocket())
    act(() => mockVisibilityListener!({ visibility: 'visible', focused: true }))
    expect(mockSocket.connect).toHaveBeenCalledTimes(1)
    expect(mockMessages.fetchMessages).not.toHaveBeenCalled()
  })

  it.each(['isLoading', 'hasNewer'] as const)('preserves %s on tray restore', (flag) => {
    mockVisibility = { visibility: 'hidden', focused: false }
    mockSocket.connected = true
    mockMessages[flag] = true
    mockDm[flag] = true
    renderHook(() => useSocket())
    act(() => mockVisibilityListener!({ visibility: 'visible', focused: true }))
    expect(mockMessages.fetchMessages).not.toHaveBeenCalled()
    expect(mockMessages.fetchNewerMessages).not.toHaveBeenCalled()
    expect(mockDm.fetchMessages).not.toHaveBeenCalled()
    expect(mockDm.fetchNewerMessages).not.toHaveBeenCalled()
  })

  it('retries histories that failed to load when the socket connects', () => {
    renderHook(() => useSocket())
    act(() => {
      mockListeners.get('connect')!()
    })
    expect(mockMessages.fetchMessages).toHaveBeenCalledWith('channel')
    expect(mockDm.fetchMessages).toHaveBeenCalledWith('dm')
    expect(mockMessages.fetchNewerMessages).not.toHaveBeenCalled()
    expect(mockDm.fetchNewerMessages).not.toHaveBeenCalled()
  })

  it('reloads previously empty histories to recover missed first messages', () => {
    mockMessages.loadedForChannelId = 'channel'
    mockDm.loadedForConvId = 'dm'
    renderHook(() => useSocket())
    act(() => {
      mockListeners.get('connect')!()
    })
    expect(mockMessages.fetchMessages).toHaveBeenCalledWith('channel')
    expect(mockDm.fetchMessages).toHaveBeenCalledWith('dm')
  })

  it('catches up an already-loaded live conversation', () => {
    Object.assign(mockMessages, { loadedForChannelId: 'channel', messages: [{ id: 'existing' }] })
    Object.assign(mockDm, { loadedForConvId: 'dm', messages: [{ id: 'existing' }] })
    renderHook(() => useSocket())
    act(() => {
      mockListeners.get('connect')!()
    })
    expect(mockMessages.fetchNewerMessages).toHaveBeenCalledWith('channel')
    expect(mockDm.fetchNewerMessages).toHaveBeenCalledWith('dm')
    expect(mockMessages.fetchMessages).not.toHaveBeenCalled()
    expect(mockDm.fetchMessages).not.toHaveBeenCalled()
  })

  it.each(['isLoading', 'hasNewer'] as const)('does not interrupt a conversation with %s', (flag) => {
    mockMessages[flag] = true
    mockDm[flag] = true
    renderHook(() => useSocket())
    act(() => {
      mockListeners.get('connect')!()
    })
    expect(mockMessages.fetchMessages).not.toHaveBeenCalled()
    expect(mockDm.fetchMessages).not.toHaveBeenCalled()
    expect(mockMessages.fetchNewerMessages).not.toHaveBeenCalled()
    expect(mockDm.fetchNewerMessages).not.toHaveBeenCalled()
  })
})
