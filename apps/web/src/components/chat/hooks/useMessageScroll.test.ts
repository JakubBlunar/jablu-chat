import { createElement } from 'react'
import { render, renderHook, act, fireEvent, waitFor } from '@testing-library/react'
import { useMessageScroll, type ScrollStoreAdapter } from './useMessageScroll'
import { makeMessage, makeMessages, resetMsgSeq } from '@/test/factories'
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

beforeAll(() => {
  class FakeObserver {
    observe() {}
    disconnect() {}
    unobserve() {}
  }
  // jsdom doesn't implement these; the hook only uses them as
  // best-effort mutation/resize listeners that complement the
  // synchronous useLayoutEffect snap.
  const g = global as unknown as {
    ResizeObserver?: typeof FakeObserver
    IntersectionObserver?: typeof FakeObserver
  }
  if (!g.ResizeObserver) g.ResizeObserver = FakeObserver
  if (!g.IntersectionObserver) g.IntersectionObserver = FakeObserver
})

describe('useMessageScroll', () => {
  describe('recoverable history navigation', () => {
    let errorLog: jest.SpyInstance
    beforeEach(() => {
      errorLog = jest.spyOn(console, 'error').mockImplementation(() => {})
    })
    afterEach(() => {
      errorLog.mockRestore()
    })

    it('preserves visible messages after a failed jump and retries the original target', async () => {
      const visible = makeMessage({ id: 'visible' })
      const target = makeMessage({ id: 'target' })
      const snapshot = { messages: [visible], isLoading: false, hasMore: true, hasNewer: false }
      const element = document.createElement('div')
      element.id = 'msg-target'
      element.scrollIntoView = jest.fn()
      const fetchAround = jest
        .fn<Promise<void>, [string, string]>()
        .mockRejectedValueOnce(new Error('offline'))
        .mockImplementationOnce(async () => {
          snapshot.messages = [target]
          document.body.appendChild(element)
        })
      const adapter = makeAdapter({
        messages: snapshot.messages,
        scrollToMessageId: 'target',
        getLoadedForId: () => 'ch-1',
        getSnapshot: () => snapshot,
        fetchMessagesAround: fetchAround
      })
      const { result, unmount } = renderHook(() => useMessageScroll('ch-1', adapter))
      await waitFor(() => expect(result.current.historyError).toBe('historyLoadFailed'))
      expect(snapshot.messages).toEqual([visible])
      expect(adapter.clearMessages).not.toHaveBeenCalled()
      act(() => result.current.retryHistory?.())
      await waitFor(() => expect(element.scrollIntoView).toHaveBeenCalled())
      expect(fetchAround).toHaveBeenLastCalledWith('ch-1', 'target')
      expect(adapter.setScrollToMessageId).toHaveBeenCalledWith(null)
      expect(result.current.historyError).toBeNull()
      unmount()
      element.remove()
    })

    it('reports an unavailable target instead of polling empty history indefinitely', async () => {
      const adapter = makeAdapter({ scrollToMessageId: 'deleted', getLoadedForId: () => 'ch-1' })
      const { result } = renderHook(() => useMessageScroll('ch-1', adapter))
      await waitFor(() => expect(result.current.historyError).toBe('messageUnavailable'))
      expect(adapter.fetchMessagesAround).toHaveBeenCalledTimes(1)
      act(() => result.current.dismissHistoryError?.())
      expect(adapter.setScrollToMessageId).toHaveBeenCalledWith(null)
      expect(result.current.historyError).toBeNull()
    })

    it('bounds a stalled jump and offers recovery', async () => {
      jest.useFakeTimers()
      const adapter = makeAdapter({
        scrollToMessageId: 'target',
        getLoadedForId: () => 'ch-1',
        fetchMessagesAround: jest.fn(() => new Promise(() => {}))
      })
      const { result, unmount } = renderHook(() => useMessageScroll('ch-1', adapter))
      await act(async () => {
        await jest.advanceTimersByTimeAsync(15_001)
      })
      expect(result.current.historyError).toBe('historyLoadFailed')
      expect(result.current.retryHistory).toEqual(expect.any(Function))
      unmount()
      jest.useRealTimers()
    })

    it('does not report a failed old jump after switching conversations', async () => {
      let reject!: (error: Error) => void
      let loadedId = 'ch-1'
      const adapter = makeAdapter({
        scrollToMessageId: 'old-target',
        getLoadedForId: () => loadedId,
        fetchMessagesAround: jest.fn(
          () =>
            new Promise((_resolve, fail) => {
              reject = fail
            })
        )
      })
      const { result, rerender } = renderHook(({ id }) => useMessageScroll(id, adapter), {
        initialProps: { id: 'ch-1' }
      })
      adapter.scrollToMessageId = null
      loadedId = 'ch-2'
      rerender({ id: 'ch-2' })
      await act(async () => {
        reject(new Error('old failure'))
      })
      expect(result.current.historyError).toBeNull()
      expect(errorLog).not.toHaveBeenCalled()
    })
  })

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
      const { rerender } = renderHook(({ contextId }) => useMessageScroll(contextId, adapter), {
        initialProps: { contextId: 'ch-1' }
      })

      rerender({ contextId: 'ch-2' })
      expect(adapter.onContextLeave).toHaveBeenCalledWith('ch-1')
    })

    // Regression: navigation.store pre-fetches messages for the target channel
    // before flipping the channel id, so when MessageArea re-renders with the
    // new contextId, getLoadedForId() already returns the new id (alreadyLoaded
    // is true). Previously this caused the snap-to-bottom logic to be skipped
    // entirely, leaving the user at scrollTop=0; the briefly-visible top
    // sentinel then triggered load-older and stranded them mid-list.
    it('does not refetch but still snaps on context switch when target is already loaded', () => {
      let loadedId: string | null = 'ch-1'
      const adapter = makeAdapter({ getLoadedForId: () => loadedId })

      const { result, rerender } = renderHook(({ contextId }) => useMessageScroll(contextId, adapter), {
        initialProps: { contextId: 'ch-1' }
      })

      expect(result.current.settling).toBe(false)

      loadedId = 'ch-2'
      rerender({ contextId: 'ch-2' })

      // The snap happens synchronously inline (no settling flash, no refetch)
      // because the data is already in the store.
      expect(result.current.settling).toBe(false)
      expect(adapter.clearMessages).not.toHaveBeenCalled()
      expect(adapter.fetchMessages).not.toHaveBeenCalled()
    })
  })

  describe('initial mount with pre-loaded data', () => {
    // Regression: when MessageArea remounts (e.g. after leaving a voice room
    // in the same channel) the message store still has data for the current
    // channel. The fresh scroll container starts at scrollTop=0; we must
    // synchronously snap to the bottom inside the context-switch effect,
    // otherwise the user lands at the top of the channel.
    it('snaps to bottom on initial mount when data is already loaded', () => {
      const adapter = makeAdapter({ getLoadedForId: () => 'ch-1' })
      const { result } = renderHook(() => useMessageScroll('ch-1', adapter))

      // No refetch, no settling flash.
      expect(adapter.fetchMessages).not.toHaveBeenCalled()
      expect(adapter.clearMessages).not.toHaveBeenCalled()
      expect(result.current.settling).toBe(false)
      expect(result.current.atBottom).toBe(true)
    })
  })

  describe('scroll to message + context switch', () => {
    // Regression: switching channel via a search result sets scrollToMessageId
    // and contextId in the same navigation step. The context-switch effect
    // must NOT auto-snap to bottom in that case — that would fight the
    // scroll-to-message useEffect's scrollIntoView and the force-bottom
    // window would yank the user back to the bottom after image loads.
    it('does not auto-snap or arm force-bottom when scrollToMessageId is pending', () => {
      let loadedId: string | null = 'ch-1'
      const adapter = makeAdapter({
        scrollToMessageId: 'msg-target',
        getLoadedForId: () => loadedId
      })

      const { rerender } = renderHook(({ contextId }) => useMessageScroll(contextId, adapter), {
        initialProps: { contextId: 'ch-1' }
      })

      loadedId = 'ch-2'
      rerender({ contextId: 'ch-2' })

      // No refetch (data is already loaded for ch-2).
      expect(adapter.fetchMessages).not.toHaveBeenCalled()
      // No clear (we want to keep the data for scroll-to-message).
      expect(adapter.clearMessages).not.toHaveBeenCalled()
    })
  })

  describe('load older suppression', () => {
    // Regression: the top sentinel briefly intersects after a context switch
    // because the new scroll container starts at scrollTop=0. Until the
    // pendingGoToBottom snap fires, load-older requests must be suppressed.
    it('does not fire load-older immediately after a context switch with pre-loaded data', async () => {
      let loadedId: string | null = 'ch-1'
      const adapter = makeAdapter({
        hasMore: true,
        messages: [
          {
            id: 'm1',
            authorId: 'u1',
            content: 'first',
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z'
          } as any as Message
        ],
        getLoadedForId: () => loadedId
      })

      const { rerender } = renderHook(({ contextId }) => useMessageScroll(contextId, adapter), {
        initialProps: { contextId: 'ch-1' }
      })

      loadedId = 'ch-2'
      ;(adapter.fetchMessages as jest.Mock).mockClear()
      rerender({ contextId: 'ch-2' })

      // fetchMessages should not be called as part of load-older during the
      // initial settle window for the new context (alreadyLoaded is true so no
      // initial fetch either).
      await Promise.resolve()
      expect(adapter.fetchMessages).not.toHaveBeenCalled()
    })

    it('settling is true during context switch and remains until messages arrive', () => {
      const adapter = makeAdapter({
        getLoadedForId: jest.fn(() => null),
        messages: []
      })

      const { result } = renderHook(({ adapter: a }) => useMessageScroll('ch-1', a), { initialProps: { adapter } })

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

  // Regression: after the flex-col-reverse → flex-col rework, the browser no
  // longer keeps the scroll pinned to the bottom when content grows below
  // the viewport. The hook must explicitly snap to the new bottom whenever
  // a message is appended while the user is already at the bottom (or the
  // post-send force-bottom window is still active). Without this, the user
  // sends a message and stares at the previous bottom while their just-sent
  // message sits hidden below the visible area.
  describe('snap to bottom on new bottom message', () => {
    function attachScrollContainer(scrollHeight: number, clientHeight = 400) {
      const sp = document.createElement('div')
      Object.defineProperty(sp, 'scrollHeight', { value: scrollHeight, configurable: true, writable: true })
      Object.defineProperty(sp, 'clientHeight', { value: clientHeight, configurable: true, writable: true })
      sp.scrollTop = 0
      return sp
    }

    it('snaps scrollTop to scrollHeight when a new message id appears at the bottom', () => {
      const state = {
        messages: [makeMessage({ id: 'm1' })],
        isLoading: false,
        hasMore: false,
        hasNewer: false
      }
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
        fetchMessages: jest.fn(async () => {}),
        fetchMessagesAround: jest.fn(async () => {}),
        clearMessages: jest.fn(),
        setScrollToMessageId: jest.fn(),
        getLoadedForId: () => 'ch-1',
        getSnapshot: () => ({ ...state }),
        onContextJoin: jest.fn(),
        onContextLeave: jest.fn()
      }

      const { result, rerender } = renderHook(() => useMessageScroll('ch-1', adapter))

      const sp = attachScrollContainer(800)
      ;(result.current.scrollParentRef as { current: HTMLDivElement | null }).current = sp

      act(() => {
        state.messages = [...state.messages, makeMessage({ id: 'm2' })]
        Object.defineProperty(sp, 'scrollHeight', { value: 1200, configurable: true, writable: true })
        rerender()
      })

      expect(sp.scrollTop).toBe(1200)
    })

    it('does not snap when a load-older prepend grows the list (last id unchanged)', () => {
      const state = {
        messages: [makeMessage({ id: 'm5' }), makeMessage({ id: 'm6' })],
        isLoading: false,
        hasMore: true,
        hasNewer: false
      }
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
        fetchMessages: jest.fn(async () => {}),
        fetchMessagesAround: jest.fn(async () => {}),
        clearMessages: jest.fn(),
        setScrollToMessageId: jest.fn(),
        getLoadedForId: () => 'ch-1',
        getSnapshot: () => ({ ...state }),
        onContextJoin: jest.fn(),
        onContextLeave: jest.fn()
      }

      const { result, rerender } = renderHook(() => useMessageScroll('ch-1', adapter))

      const sp = attachScrollContainer(800)
      sp.scrollTop = 200
      ;(result.current.scrollParentRef as { current: HTMLDivElement | null }).current = sp

      act(() => {
        state.messages = [makeMessage({ id: 'm3' }), makeMessage({ id: 'm4' }), ...state.messages]
        Object.defineProperty(sp, 'scrollHeight', { value: 1200, configurable: true, writable: true })
        rerender()
      })

      expect(sp.scrollTop).toBe(200)
    })

    it('does not snap when a scroll-to-message request is pending', () => {
      const state = {
        messages: [makeMessage({ id: 'm1' })],
        isLoading: false,
        hasMore: false,
        hasNewer: false
      }
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
        scrollToMessageId: 'm-target',
        scrollRequestNonce: 0,
        fetchMessages: jest.fn(async () => {}),
        fetchMessagesAround: jest.fn(async () => {}),
        clearMessages: jest.fn(),
        setScrollToMessageId: jest.fn(),
        getLoadedForId: () => 'ch-1',
        getSnapshot: () => ({ ...state }),
        onContextJoin: jest.fn(),
        onContextLeave: jest.fn()
      }

      const { result, rerender } = renderHook(() => useMessageScroll('ch-1', adapter))

      const sp = attachScrollContainer(800)
      sp.scrollTop = 100
      ;(result.current.scrollParentRef as { current: HTMLDivElement | null }).current = sp

      act(() => {
        state.messages = [...state.messages, makeMessage({ id: 'm2' })]
        Object.defineProperty(sp, 'scrollHeight', { value: 1200, configurable: true, writable: true })
        rerender()
      })

      expect(sp.scrollTop).toBe(100)
    })
  })

  describe('mobile viewport height changes', () => {
    const resizeObservers: { callback: ResizeObserverCallback; targets: Set<Element>; observer: ResizeObserver }[] = []

    beforeEach(() => {
      jest.useFakeTimers()
      resizeObservers.length = 0
      jest.spyOn(globalThis, 'ResizeObserver').mockImplementation((callback) => {
        const targets = new Set<Element>()
        const observer = {
          observe: (target: Element) => {
            targets.add(target)
          },
          unobserve: (target: Element) => {
            targets.delete(target)
          },
          disconnect: () => {
            targets.clear()
          }
        }
        resizeObservers.push({ callback, targets, observer })
        return observer
      })
    })

    afterEach(() => {
      jest.clearAllTimers()
      jest.useRealTimers()
      jest.restoreAllMocks()
    })

    function mountScrollableHistory() {
      const viewport = { width: 320, height: 400 }
      const adapter = makeAdapter({ messages: makeMessages(1), getLoadedForId: () => 'ch-1' })
      let scroll!: ReturnType<typeof useMessageScroll>
      function Harness() {
        scroll = useMessageScroll('ch-1', adapter)
        return createElement('div', {
          ref: (element: HTMLDivElement | null) => {
            scroll.scrollParentRef.current = element
            if (!element) return
            Object.defineProperties(element, {
              clientWidth: { configurable: true, get: () => viewport.width },
              clientHeight: { configurable: true, get: () => viewport.height },
              scrollHeight: { configurable: true, value: 1000 }
            })
          }
        })
      }
      render(createElement(Harness))
      act(() => {
        jest.advanceTimersByTime(1100)
      })
      const element = scroll.scrollParentRef.current!
      element.scrollTop = 600
      const resize = () => {
        act(() => {
          for (const entry of resizeObservers) {
            if (entry.targets.has(element)) entry.callback([], entry.observer)
          }
        })
      }
      return { element, viewport, resize, getScroll: () => scroll }
    }

    it('keeps the last message visible when the bottom navigation returns', () => {
      const { element, viewport, resize, getScroll } = mountScrollableHistory()
      viewport.height = 456
      element.scrollTop = 544
      resize()

      element.scrollTop = 544
      viewport.height = 400
      fireEvent.scroll(element)
      resize()

      expect(element.scrollTop).toBe(1000)
      expect(getScroll().atBottom).toBe(true)
    })

    it('does not jump to the bottom when the user is reading older messages', () => {
      const { element, viewport, resize, getScroll } = mountScrollableHistory()
      element.scrollTop = 200
      fireEvent.scroll(element)
      expect(getScroll().atBottom).toBe(false)

      viewport.height = 344
      resize()

      expect(element.scrollTop).toBe(200)
      expect(getScroll().atBottom).toBe(false)
    })
  })

  describe('handleBottomButtonClick', () => {
    it('is a callable function', () => {
      const adapter = makeAdapter({ getLoadedForId: jest.fn(() => 'ch-1') })
      const { result } = renderHook(() => useMessageScroll('ch-1', adapter))

      expect(typeof result.current.handleBottomButtonClick).toBe('function')
      act(() => result.current.handleBottomButtonClick())
    })

    it('fetches the latest messages without clearing visible history when hasNewer', () => {
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

      expect(adapter.clearMessages).not.toHaveBeenCalled()
      expect(adapter.fetchMessages).toHaveBeenCalledWith('ch-1')
    })
  })
})
