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
    requestJump: jest.fn(),
    requestLatest: jest.fn(),
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

function renderScrollableHistory(adapter: ScrollStoreAdapter, initialTarget?: HTMLElement) {
  let scroll!: ReturnType<typeof useMessageScroll>
  function Harness() {
    scroll = useMessageScroll('ch-1', adapter)
    return createElement('div', {
      ref: (element: HTMLDivElement | null) => {
        scroll.scrollParentRef.current = element
        if (!element) return
        Object.defineProperties(element, {
          clientHeight: { configurable: true, value: 400 },
          scrollHeight: { configurable: true, value: 2000 }
        })
        element.getBoundingClientRect = () => ({ top: 100 }) as DOMRect
        if (initialTarget) element.append(initialTarget)
      }
    })
  }
  const view = render(createElement(Harness))
  return {
    ...view,
    result: {
      get current() {
        return scroll
      }
    },
    rerender: () => view.rerender(createElement(Harness)),
    viewport: view.container.firstElementChild as HTMLDivElement
  }
}

beforeEach(() => {
  resetMsgSeq()
})

beforeAll(() => {
  document.elementFromPoint = jest.fn(() => null)
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
  describe('coordinator positioning contract', () => {
    it('delegates jumps and latest intent without reading or clearing history', () => {
      const adapter = makeAdapter({
        requestJump: jest.fn(),
        requestLatest: jest.fn(),
        hasNewer: true,
        getSnapshot: () => ({ messages: [], isLoading: false, hasMore: false, hasNewer: true })
      })
      const { result } = renderHook(() => useMessageScroll('ch-1', adapter))
      act(() => result.current.handleJumpToMessage('target'))
      act(() => result.current.handleBottomButtonClick())
      expect(adapter.requestJump).toHaveBeenCalledWith('target')
      expect(adapter.requestLatest).toHaveBeenCalledTimes(1)
      expect(adapter.fetchMessages).not.toHaveBeenCalled()
      expect(adapter.fetchMessagesAround).not.toHaveBeenCalled()
      expect(adapter.clearMessages).not.toHaveBeenCalled()
    })

    it('centers and highlights a coordinator-loaded target', async () => {
      const target = makeMessage({ id: 'original' })
      const element = document.createElement('div')
      element.id = 'msg-original'
      element.getBoundingClientRect = () => ({ top: 800, height: 80 }) as DOMRect
      const adapter = makeAdapter({
        messages: [target],
        scrollToMessageId: 'original',
        getLoadedForId: () => 'ch-1',
        getSnapshot: () => ({ messages: [target], isLoading: false, hasMore: false, hasNewer: false })
      })
      const { viewport, unmount } = renderScrollableHistory(adapter, element)
      await waitFor(() => expect(adapter.setScrollToMessageId).toHaveBeenCalledWith(null))
      expect(viewport.scrollTop).toBe(540)
      expect(element.classList.contains('bg-primary/10')).toBe(true)
      expect(adapter.fetchMessagesAround).not.toHaveBeenCalled()
      unmount()
    })

    it('waits for the complete coordinator load before consuming a scroll target', async () => {
      const target = makeMessage({ id: 'original' })
      const element = document.createElement('div')
      element.id = 'msg-original'
      const adapter = makeAdapter({
        messages: [target],
        scrollToMessageId: 'original',
        deferInitialLoad: true,
        getLoadedForId: () => 'ch-1',
        getSnapshot: () => ({ messages: [target], isLoading: false, hasMore: false, hasNewer: false })
      })
      const { rerender, unmount } = renderScrollableHistory(adapter, element)
      expect(adapter.setScrollToMessageId).not.toHaveBeenCalled()
      adapter.deferInitialLoad = false
      rerender()
      await waitFor(() => expect(adapter.setScrollToMessageId).toHaveBeenCalledWith(null))
      unmount()
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
    it('never competes with the coordinator before or after loading', () => {
      const adapter = makeAdapter({ deferInitialLoad: true })
      const { result, rerender } = renderHook(() => useMessageScroll('ch-1', adapter))
      expect(result.current.settling).toBe(true)
      adapter.deferInitialLoad = false
      rerender()
      expect(result.current.settling).toBe(false)
      expect(adapter.fetchMessages).not.toHaveBeenCalled()
      expect(adapter.clearMessages).not.toHaveBeenCalled()
    })
    it('does not start a second loader for a new unprepared context', () => {
      const adapter = makeAdapter()
      const { rerender } = renderHook(({ id }) => useMessageScroll(id, adapter), { initialProps: { id: 'ch-1' } })
      rerender({ id: 'ch-2' })
      expect(adapter.fetchMessages).not.toHaveBeenCalled()
      expect(adapter.fetchMessagesAround).not.toHaveBeenCalled()
      expect(adapter.clearMessages).not.toHaveBeenCalled()
    })
    it('stashes the outgoing context through its leave callback', () => {
      const adapter = makeAdapter({ getLoadedForId: () => 'ch-1' })
      const { rerender } = renderHook(({ id }) => useMessageScroll(id, adapter), { initialProps: { id: 'ch-1' } })
      rerender({ id: 'ch-2' })
      expect(adapter.onContextLeave).toHaveBeenCalledWith('ch-1')
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
        requestJump: jest.fn(),
        requestLatest: jest.fn(),
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
        requestJump: jest.fn(),
        requestLatest: jest.fn(),
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
        requestJump: jest.fn(),
        requestLatest: jest.fn(),
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
      expect(adapter.requestLatest).toHaveBeenCalledTimes(1)
      expect(adapter.fetchMessages).not.toHaveBeenCalled()
    })
  })
})
