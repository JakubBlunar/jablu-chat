import { act, render, screen } from '@testing-library/react'
import { useRef } from 'react'
import { useNotificationCenterStore } from '@/stores/notificationCenter.store'
import { makeMessage } from '@/test/factories'
import { useSeenReactionActivity } from './useSeenReactionActivity'

let mockFocused = true
let mockFocusChanged: () => void
jest.mock('@/lib/appVisibility', () => ({
  isAppFocused: () => mockFocused,
  subscribeAppVisibility: (listener: () => void) => {
    mockFocusChanged = listener
    return () => {}
  }
}))

it('marks only the reaction visible in the focused chat, including one that arrives after opening the chat', () => {
  const store = useNotificationCenterStore
  const older = { id: 'old-activity', messageId: 'old', emoji: '👍', isCustom: false, updatedAt: '2026-11-20T10:00:00.000Z' }
  const current = { ...older, id: 'new-activity', messageId: 'current' }
  const markReactionsSeen = jest.fn().mockResolvedValue(undefined)
  const originalObserver = Object.getOwnPropertyDescriptor(window, 'IntersectionObserver')
  const originalHitTest = Object.getOwnPropertyDescriptor(document, 'elementFromPoint')
  const observers = new Map<Element, IntersectionObserverCallback>()
  const stableMessage = [makeMessage({ id: 'current' })]

  function Chat({ paused = false }: { paused?: boolean }) {
    const viewport = useRef<HTMLDivElement>(null)
    const { ref, unseenReactionKeys } = useSeenReactionActivity(stableMessage, viewport, paused)
    return (
      <div ref={viewport}>
        <div ref={ref} data-testid="current-message">
          <button type="button" data-unseen-reaction={unseenReactionKeys?.has('false:👍') ? 'false:👍' : undefined}>
            React
          </button>
        </div>
      </div>
    )
  }

  jest.useFakeTimers()
  mockFocused = false
  Object.defineProperty(window, 'IntersectionObserver', {
    configurable: true,
    value: class {
      private readonly callback: IntersectionObserverCallback

      constructor(callback: IntersectionObserverCallback) {
        this.callback = callback
      }

      observe(element: Element) {
        observers.set(element, this.callback)
      }

      disconnect() {}
    }
  })
  const hitTest = jest.fn()
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: hitTest })
  jest.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 200, 40))
  store.setState({ reactionsByMessage: new Map([['old', [older]]]), markReactionsSeen })
  const { unmount } = render(<Chat />)
  try {
    const row = screen.getByTestId('current-message')
    const pill = screen.getByRole('button', { name: 'React' })
    expect(observers.size).toBe(0)

    act(() => store.setState({ reactionsByMessage: new Map([['old', [older]], ['current', [current]]]) }))
    expect(pill.getAttribute('data-unseen-reaction')).toBe('false:👍')
    act(() => observers.get(row)?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver))
    act(() => jest.advanceTimersByTime(1000))
    expect(markReactionsSeen).not.toHaveBeenCalled()

    // A covering panel cannot acknowledge through to the underlying chat.
    hitTest.mockReturnValue(document.body)
    mockFocused = true
    act(() => mockFocusChanged())
    act(() => jest.advanceTimersByTime(1000))
    expect(markReactionsSeen).not.toHaveBeenCalled()

    hitTest.mockReturnValue(pill)
    act(() => jest.advanceTimersByTime(1000))
    expect(markReactionsSeen).toHaveBeenCalledTimes(1)
    expect(markReactionsSeen).toHaveBeenCalledWith([current])
  } finally {
    unmount()
    store.getState().reset()
    jest.restoreAllMocks()
    if (originalObserver) Object.defineProperty(window, 'IntersectionObserver', originalObserver)
    else Reflect.deleteProperty(window, 'IntersectionObserver')
    if (originalHitTest) Object.defineProperty(document, 'elementFromPoint', originalHitTest)
    else Reflect.deleteProperty(document, 'elementFromPoint')
    jest.useRealTimers()
  }
})
