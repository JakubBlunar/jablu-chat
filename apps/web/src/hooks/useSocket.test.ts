import { act, renderHook } from '@testing-library/react'
import { useSocket } from './useSocket'

const mockListeners = new Map<string, () => void>()
const mockSocket = {
  connected: false,
  emit: jest.fn(),
  on: jest.fn((event: string, handler: () => void) => {
    mockListeners.set(event, handler)
  }),
  off: jest.fn(),
  disconnect: jest.fn()
}
const mockAuth = { accessToken: 'token', user: { id: 'user' } }
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
jest.mock('@/stores/server.store', () => ({ useServerStore: {} }))
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
  beforeEach(() => {
    jest.clearAllMocks()
    mockListeners.clear()
    Object.assign(mockMessages, { loadedForChannelId: null, messages: [], isLoading: false, hasNewer: false })
    Object.assign(mockDm, { loadedForConvId: null, messages: [], isLoading: false, hasNewer: false })
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
