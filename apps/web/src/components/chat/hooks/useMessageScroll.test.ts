import { renderHook, act } from '@testing-library/react'
import { useMessageScroll, type ScrollStoreAdapter } from './useMessageScroll'
import { makeMessages, resetMsgSeq } from '@/test/factories'
import type { Message } from '@chat/shared'

function makeAdapter(overrides: Partial<ScrollStoreAdapter> = {}): ScrollStoreAdapter {
  const state = {
    messages: [] as Message[],
    isLoading: false,
    hasMore: false,
    hasNewer: false,
    scrollToMessageId: null as string | null,
    scrollRequestNonce: 0
  }

  return {
    ...state,
    fetchMessages: jest.fn(async () => {}),
    fetchMessagesAround: jest.fn(async () => {}),
    fetchNewerMessages: jest.fn(async () => {}),
    clearMessages: jest.fn(),
    setScrollToMessageId: jest.fn(),
    getLoadedForId: jest.fn(() => null),
    getSnapshot: jest.fn(() => state),
    onContextJoin: jest.fn(),
    onContextLeave: jest.fn(),
    ...overrides
  }
}

beforeEach(() => {
  resetMsgSeq()
})

describe('useMessageScroll', () => {
  describe('initial state', () => {
    it('returns scroll refs and state', () => {
      const adapter = makeAdapter({ getLoadedForId: jest.fn(() => 'ch-1') })
      const { result } = renderHook(() => useMessageScroll('ch-1', adapter))

      expect(result.current.scrollParentRef).toBeDefined()
      expect(result.current.topSentinelRef).toBeDefined()
      expect(result.current.bottomSentinelRef).toBeDefined()
      expect(result.current.newerSentinelRef).toBeDefined()
      expect(result.current.atBottom).toBe(true)
      expect(result.current.settling).toBe(false)
      expect(typeof result.current.stickToBottom).toBe('function')
      expect(typeof result.current.handleBottomButtonClick).toBe('function')
      expect(typeof result.current.handleJumpToMessage).toBe('function')
    })

    it('reuses the same scroll API object across rerenders when state is unchanged', () => {
      const adapter = makeAdapter({ getLoadedForId: jest.fn(() => 'ch-1') })
      const { result, rerender } = renderHook(() => useMessageScroll('ch-1', adapter))
      const first = result.current
      rerender()
      expect(result.current).toBe(first)
    })
  })

  describe('context switch', () => {
    it('calls clearMessages and fetchMessages for a new context', () => {
      const adapter = makeAdapter({ getLoadedForId: jest.fn(() => null) })
      renderHook(() => useMessageScroll('ch-1', adapter))

      expect(adapter.clearMessages).toHaveBeenCalled()
      expect(adapter.fetchMessages).toHaveBeenCalledWith('ch-1')
    })

    it('sets settling to true during context switch', () => {
      const adapter = makeAdapter({ getLoadedForId: jest.fn(() => null) })
      const { result } = renderHook(() => useMessageScroll('ch-1', adapter))

      expect(result.current.settling).toBe(true)
    })

    it('does not refetch when context is already loaded', () => {
      const adapter = makeAdapter({ getLoadedForId: jest.fn(() => 'ch-1') })
      renderHook(() => useMessageScroll('ch-1', adapter))

      expect(adapter.clearMessages).not.toHaveBeenCalled()
      expect(adapter.fetchMessages).not.toHaveBeenCalled()
    })

    it('calls onContextJoin for new context', () => {
      const adapter = makeAdapter({ getLoadedForId: jest.fn(() => null) })
      renderHook(() => useMessageScroll('ch-1', adapter))

      expect(adapter.onContextJoin).toHaveBeenCalledWith('ch-1')
    })

    it('calls onContextLeave when switching contexts', () => {
      const adapter = makeAdapter({ getLoadedForId: jest.fn(() => null) })
      const { rerender } = renderHook(
        ({ contextId }) => useMessageScroll(contextId, adapter),
        { initialProps: { contextId: 'ch-1' } }
      )

      rerender({ contextId: 'ch-2' })
      expect(adapter.onContextLeave).toHaveBeenCalledWith('ch-1')
    })

    it('settling is true during context switch and remains until messages arrive', () => {
      const adapter = makeAdapter({
        getLoadedForId: jest.fn(() => null),
        messages: []
      })

      const { result } = renderHook(
        ({ adapter: a }) => useMessageScroll('ch-1', a),
        { initialProps: { adapter } }
      )

      expect(result.current.settling).toBe(true)
    })

    it('clears settling when thread finishes loading with zero messages', async () => {
      const state = {
        messages: [] as Message[],
        isLoading: true,
        hasMore: false,
        hasNewer: false
      }
      let loadedId: string | null = null
      const fetchMessagesSpy = jest.fn(async () => {
        await Promise.resolve()
        state.isLoading = false
        state.messages = []
        loadedId = 'ch-1'
      })
      const adapter: ScrollStoreAdapter = {
        get messages() {
          return state.messages
        },
        get isLoading() {
          return state.isLoading
        },
        get hasMore() {
          return state.hasMore
        },
        get hasNewer() {
          return state.hasNewer
        },
        scrollToMessageId: null,
        scrollRequestNonce: 0,
        fetchMessages: fetchMessagesSpy,
        fetchMessagesAround: jest.fn(async () => {}),
        clearMessages: jest.fn(() => {
          state.messages = []
        }),
        setScrollToMessageId: jest.fn(),
        getLoadedForId: () => loadedId,
        getSnapshot: () => ({
          messages: state.messages,
          isLoading: state.isLoading,
          hasMore: state.hasMore,
          hasNewer: state.hasNewer
        }),
        onContextJoin: jest.fn(),
        onContextLeave: jest.fn()
      }

      const { result, rerender } = renderHook(() => useMessageScroll('ch-1', adapter))

      expect(result.current.settling).toBe(true)

      await act(async () => {
        const p = fetchMessagesSpy.mock.results[0]?.value as Promise<void> | undefined
        if (p) await p
        rerender()
      })

      expect(result.current.settling).toBe(false)
    })
  })

  describe('null contextId', () => {
    it('does not fetch when contextId is null', () => {
      const adapter = makeAdapter()
      renderHook(() => useMessageScroll(null, adapter))

      expect(adapter.fetchMessages).not.toHaveBeenCalled()
      expect(adapter.clearMessages).not.toHaveBeenCalled()
    })
  })

  describe('handleBottomButtonClick', () => {
    it('is a callable function', () => {
      const adapter = makeAdapter({ getLoadedForId: jest.fn(() => 'ch-1') })
      const { result } = renderHook(() => useMessageScroll('ch-1', adapter))

      expect(typeof result.current.handleBottomButtonClick).toBe('function')
      act(() => result.current.handleBottomButtonClick())
    })

    it('calls clearMessages and fetchMessages when hasNewer', () => {
      const adapter = makeAdapter({
        getLoadedForId: jest.fn(() => 'ch-1'),
        hasNewer: true
      })
      adapter.getSnapshot = jest.fn(() => ({
        messages: makeMessages(5),
        isLoading: false,
        hasMore: false,
        hasNewer: true
      }))

      const { result } = renderHook(() => useMessageScroll('ch-1', adapter))
      act(() => result.current.handleBottomButtonClick())

      expect(adapter.clearMessages).toHaveBeenCalled()
      expect(adapter.fetchMessages).toHaveBeenCalledWith('ch-1')
    })
  })
})
