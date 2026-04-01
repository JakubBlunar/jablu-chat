import { renderHook, act } from '@testing-library/react'
import { useMessageStoreAdapter } from './useMessageStoreAdapter'
import { useMessageStore } from '@/stores/message.store'
import { useDmStore } from '@/stores/dm.store'
import { makeMessages, resetMsgSeq } from '@/test/factories'

jest.mock('@/lib/api', () => ({
  api: {
    getMessages: jest.fn(),
    getDMMessages: jest.fn()
  }
}))

jest.mock('@/lib/socket', () => ({
  getSocket: jest.fn(() => ({
    connected: true,
    emit: jest.fn()
  }))
}))

import { getSocket } from '@/lib/socket'
const mockGetSocket = jest.mocked(getSocket)

beforeEach(() => {
  resetMsgSeq()
  jest.clearAllMocks()
})

describe('useMessageStoreAdapter', () => {
  describe('channel mode', () => {
    it('returns channel store state', () => {
      const msgs = makeMessages(3)
      useMessageStore.setState({
        messages: msgs, isLoading: false, hasMore: true, hasNewer: false
      })

      const { result } = renderHook(() => useMessageStoreAdapter('channel'))
      expect(result.current.messages).toHaveLength(3)
      expect(result.current.hasMore).toBe(true)
      expect(result.current.isLoading).toBe(false)
    })

    it('setScrollToMessageId targets channel store', () => {
      const { result } = renderHook(() => useMessageStoreAdapter('channel'))
      act(() => result.current.setScrollToMessageId('msg-5'))
      expect(useMessageStore.getState().scrollToMessageId).toBe('msg-5')
    })

    it('getLoadedForId returns channel store loadedForChannelId', () => {
      useMessageStore.setState({ loadedForChannelId: 'ch-42' })
      const { result } = renderHook(() => useMessageStoreAdapter('channel'))
      expect(result.current.getLoadedForId()).toBe('ch-42')
    })

    it('onContextJoin emits channel:join', () => {
      const mockSocket = { connected: true, emit: jest.fn() }
      mockGetSocket.mockReturnValue(mockSocket as any)

      const { result } = renderHook(() => useMessageStoreAdapter('channel'))
      result.current.onContextJoin!('ch-1')
      expect(mockSocket.emit).toHaveBeenCalledWith('channel:join', { channelId: 'ch-1' })
    })

    it('onContextLeave emits channel:leave', () => {
      const mockSocket = { connected: true, emit: jest.fn() }
      mockGetSocket.mockReturnValue(mockSocket as any)

      const { result } = renderHook(() => useMessageStoreAdapter('channel'))
      result.current.onContextLeave!('ch-1')
      expect(mockSocket.emit).toHaveBeenCalledWith('channel:leave', { channelId: 'ch-1' })
    })
  })

  describe('dm mode', () => {
    it('returns DM store state', () => {
      const msgs = makeMessages(2)
      useDmStore.setState({
        messages: msgs, isLoading: true, hasMore: false, hasNewer: true
      })

      const { result } = renderHook(() => useMessageStoreAdapter('dm'))
      expect(result.current.messages).toHaveLength(2)
      expect(result.current.isLoading).toBe(true)
      expect(result.current.hasNewer).toBe(true)
    })

    it('setScrollToMessageId targets DM store', () => {
      const { result } = renderHook(() => useMessageStoreAdapter('dm'))
      act(() => result.current.setScrollToMessageId('dm-msg-3'))
      expect(useDmStore.getState().scrollToMessageId).toBe('dm-msg-3')
    })

    it('getLoadedForId returns DM store loadedForConvId', () => {
      useDmStore.setState({ loadedForConvId: 'conv-99' })
      const { result } = renderHook(() => useMessageStoreAdapter('dm'))
      expect(result.current.getLoadedForId()).toBe('conv-99')
    })

    it('onContextJoin emits dm:join', () => {
      const mockSocket = { connected: true, emit: jest.fn() }
      mockGetSocket.mockReturnValue(mockSocket as any)

      const { result } = renderHook(() => useMessageStoreAdapter('dm'))
      result.current.onContextJoin!('conv-1')
      expect(mockSocket.emit).toHaveBeenCalledWith('dm:join', { conversationId: 'conv-1' })
    })

    it('onContextLeave does not emit for dm', () => {
      const mockSocket = { connected: true, emit: jest.fn() }
      mockGetSocket.mockReturnValue(mockSocket as any)

      const { result } = renderHook(() => useMessageStoreAdapter('dm'))
      result.current.onContextLeave!('conv-1')
      expect(mockSocket.emit).not.toHaveBeenCalled()
    })
  })

  describe('getSnapshot', () => {
    it('returns current channel snapshot', () => {
      const msgs = makeMessages(4)
      useMessageStore.setState({ messages: msgs, isLoading: false, hasMore: true, hasNewer: false })
      const { result } = renderHook(() => useMessageStoreAdapter('channel'))
      const snap = result.current.getSnapshot()
      expect(snap.messages).toHaveLength(4)
      expect(snap.hasMore).toBe(true)
    })

    it('returns current DM snapshot', () => {
      const msgs = makeMessages(2)
      useDmStore.setState({ messages: msgs, isLoading: true, hasMore: false, hasNewer: true })
      const { result } = renderHook(() => useMessageStoreAdapter('dm'))
      const snap = result.current.getSnapshot()
      expect(snap.messages).toHaveLength(2)
      expect(snap.isLoading).toBe(true)
    })
  })
})
