import { act, renderHook } from '@testing-library/react'
import { isAppFocused, subscribeAppVisibility } from '@/lib/appVisibility'
import { useChannelAck } from './useChannelAck'
import { useReadStateStore } from '@/stores/readState.store'
import { useInboxStore } from '@/stores/inbox.store'

jest.mock('@/lib/api', () => ({
  api: { ackChannel: jest.fn(), ackDm: jest.fn() }
}))
jest.mock('@/lib/appVisibility', () => ({
  isAppFocused: jest.fn(() => true),
  subscribeAppVisibility: jest.fn(() => jest.fn())
}))
jest.mock('@/stores/voice-connection.store', () => ({
  useVoiceConnectionStore: { getState: jest.fn(() => ({ viewingVoiceRoom: false })) }
}))

import { useVoiceConnectionStore } from '@/stores/voice-connection.store'

const unread = {
  unreadCount: 3,
  mentionCount: 1,
  firstUnreadMessageId: 'm1',
  lastReadAt: '2025-01-01T00:00:00Z'
}
let ackChannel: jest.Mock
let ackDm: jest.Mock
let clearChannelView: jest.Mock
let captureChannelView: jest.Mock

function options(overrides = {}) {
  return {
    ready: true,
    atBottom: true,
    scrollParentRef: { current: document.createElement('div') },
    ...overrides
  }
}

beforeEach(() => {
  jest.useFakeTimers()
  jest.clearAllMocks()
  useInboxStore.getState().reset()
  jest.mocked(isAppFocused).mockReturnValue(true)
  jest
    .mocked(useVoiceConnectionStore.getState)
    .mockReturnValue({ viewingVoiceRoom: false } as ReturnType<typeof useVoiceConnectionStore.getState>)
  ackChannel = jest.fn().mockResolvedValue(true)
  ackDm = jest.fn().mockResolvedValue(true)
  clearChannelView = jest.fn()
  captureChannelView = jest.fn()
  useReadStateStore.setState({
    channels: new Map([['ch1', unread]]),
    dms: new Map([['dm1', unread]]),
    ackChannel,
    ackDm,
    clearChannelView,
    captureChannelView,
    captureDmView: jest.fn(),
    clearDmView: jest.fn()
  })
})

afterEach(() => jest.useRealTimers())

async function flushAck() {
  await act(async () => {
    jest.advanceTimersByTime(250)
  })
}

it.each(['channel', 'dm'] as const)('automatically reads a focused %s at the latest messages', async (mode) => {
  renderHook(() => useChannelAck(mode, mode === 'channel' ? 'ch1' : 'dm1', options()))
  expect(ackChannel).not.toHaveBeenCalled()
  await flushAck()
  expect(mode === 'channel' ? ackChannel : ackDm).toHaveBeenCalledTimes(1)
})

it.each([{ ready: false }, { atBottom: false }, { scrollParentRef: { current: null } }])(
  'does not read while the message surface is not ready: %j',
  async (override) => {
    renderHook(() => useChannelAck('channel', 'ch1', options(override)))
    await flushAck()
    expect(ackChannel).not.toHaveBeenCalled()
    expect(captureChannelView).toHaveBeenCalledWith('ch1')
  }
)

it('checks actual scroll geometry, not just stale atBottom state', async () => {
  const opts = options()
  Object.defineProperty(opts.scrollParentRef.current, 'scrollHeight', { value: 500 })
  renderHook(() => useChannelAck('channel', 'ch1', opts))
  await flushAck()
  expect(ackChannel).not.toHaveBeenCalled()
})

it('keeps hidden/unfocused messages unread, then reads on focus', async () => {
  jest.mocked(isAppFocused).mockReturnValue(false)
  const opts = options()
  renderHook(() => useChannelAck('channel', 'ch1', opts))
  await flushAck()
  expect(ackChannel).not.toHaveBeenCalled()
  jest.mocked(isAppFocused).mockReturnValue(true)
  act(() => {
    jest.mocked(subscribeAppVisibility).mock.calls[0][0]({ visibility: 'visible', focused: true })
  })
  await flushAck()
  expect(ackChannel).toHaveBeenCalledWith('ch1')
})

it('rechecks focus when an acknowledgement is about to run', async () => {
  renderHook(() => useChannelAck('channel', 'ch1', options()))
  jest.mocked(isAppFocused).mockReturnValue(false)
  await flushAck()
  expect(ackChannel).not.toHaveBeenCalled()
})

it('does not read a conversation covered by a voice room', async () => {
  jest
    .mocked(useVoiceConnectionStore.getState)
    .mockReturnValue({ viewingVoiceRoom: true } as ReturnType<typeof useVoiceConnectionStore.getState>)
  renderHook(() => useChannelAck('dm', 'dm1', options()))
  await flushAck()
  expect(ackDm).not.toHaveBeenCalled()
})

it('reads visible call chat and cancels pending reads when chat is hidden', async () => {
  jest.mocked(useVoiceConnectionStore.getState).mockReturnValue({
    viewingVoiceRoom: true, currentDmCallId: 'call1', currentChannelId: 'dm1'
  } as ReturnType<typeof useVoiceConnectionStore.getState>)
  const opts = options()
  const { rerender } = renderHook(
    ({ visible }) => useChannelAck('dm', 'dm1', { ...opts, ready: visible, callChatVisible: visible }),
    { initialProps: { visible: true } }
  )
  rerender({ visible: false })
  await flushAck()
  expect(ackDm).not.toHaveBeenCalled()
  rerender({ visible: true })
  await flushAck()
  expect(ackDm).toHaveBeenCalledWith('dm1')
})

it('does not read a different conversation through the call-chat exception', async () => {
  jest.mocked(useVoiceConnectionStore.getState).mockReturnValue({
    viewingVoiceRoom: true, currentDmCallId: 'call1', currentChannelId: 'other-dm'
  } as ReturnType<typeof useVoiceConnectionStore.getState>)
  renderHook(() => useChannelAck('dm', 'dm1', options({ callChatVisible: true })))
  await flushAck()
  expect(ackDm).not.toHaveBeenCalled()
})

it('does not mark unseen messages read when leaving', async () => {
  const { unmount } = renderHook(() => useChannelAck('channel', 'ch1', options()))
  unmount()
  await flushAck()
  expect(ackChannel).not.toHaveBeenCalled()
  expect(clearChannelView).toHaveBeenCalledWith('ch1')
})

it('acknowledges subsequent incoming messages while staying at the bottom', async () => {
  const opts = options()
  renderHook(() => useChannelAck('channel', 'ch1', opts))
  await flushAck()
  act(() => {
    useReadStateStore.setState({ channels: new Map([['ch1', { ...unread, unreadCount: 4 }]]) })
  })
  await flushAck()
  expect(ackChannel).toHaveBeenCalledTimes(2)
})

it.each(['channel', 'dm'] as const)('never automatically acknowledges a %s while Inbox covers it', async (mode) => {
  const { rerender } = renderHook(() => useChannelAck(mode, mode === 'channel' ? 'ch1' : 'dm1', options()))
  act(() => useInboxStore.getState().show())
  await flushAck()
  expect(ackChannel).not.toHaveBeenCalled()
  expect(ackDm).not.toHaveBeenCalled()
  act(() => useInboxStore.getState().close())
  rerender()
  await flushAck()
  expect(mode === 'channel' ? ackChannel : ackDm).toHaveBeenCalledTimes(1)
})

it('keeps new messages unread during a catch-up preview, even at the bottom', async () => {
  useInboxStore.setState({
    reader: {
      requestId: 1,
      navigated: true,
      sessionId: null,
      snapshotAt: '2026-01-01T00:00:00Z',
      target: { mode: 'channel', contextId: 'ch1', serverId: 's1', threadParentId: null, messageId: 'm1' },
      group: {
        key: 'ch1',
        name: 'general',
        serverName: 'Test',
        target: { mode: 'channel', contextId: 'ch1', serverId: 's1', threadParentId: null, messageId: 'm1' },
        unreadCount: 3,
        mentionCount: 0,
        replyCount: 0,
        latestAt: '2026-01-01T00:00:00Z',
        highlights: [],
        savedAt: null
      }
    }
  })
  const opts = options()
  renderHook(() => useChannelAck('channel', 'ch1', opts))
  await flushAck()
  act(() => useReadStateStore.setState({ channels: new Map([['ch1', { ...unread, unreadCount: 4 }]]) }))
  await flushAck()
  expect(ackChannel).not.toHaveBeenCalled()
})
