import { useCallback, useRef, type RefObject, type TouchEvent as ReactTouchEvent } from 'react'
import { horizontalGesture, isVerticalDrag, ownsHorizontalTouch } from '@/lib/horizontalGesture'

export function useHorizontalSwipe<T extends HTMLElement>(
  direction: 'left' | 'right',
  onSwipe: () => void,
  { startsAtEdge, preventBrowserPan, elementRef }: {
    startsAtEdge?: (event: ReactTouchEvent<HTMLElement>) => boolean
    preventBrowserPan: boolean
    elementRef?: RefObject<T | null>
  }
) {
  const start = useRef<{ x: number; y: number; recognized: boolean } | null>(null)
  const ref = useCallback((element: T | null) => {
    if (elementRef) elementRef.current = element
    if (!element) return
    // React's touchmove listener is passive. Install this before the first
    // touch so the browser can yield a horizontal pan to the app.
    const guardPan = (event: TouchEvent) => {
      const from = start.current
      if (!from || !event.cancelable || event.touches.length !== 1) return
      const dx = event.touches[0].clientX - from.x
      const dy = event.touches[0].clientY - from.y
      if (horizontalGesture(dx, dy, direction, 1)) event.preventDefault()
    }
    if (preventBrowserPan) element.addEventListener('touchmove', guardPan, { passive: false })
    return () => {
      element.removeEventListener('touchmove', guardPan)
      start.current = null
      if (elementRef) elementRef.current = null
    }
  }, [direction, preventBrowserPan, elementRef])
  return {
    ref,
    onTouchStart(event: ReactTouchEvent<HTMLElement>) {
      const point = event.touches[0]
      start.current =
        event.touches.length === 1 &&
        event.currentTarget.contains(event.target as Node) &&
        (!startsAtEdge || startsAtEdge(event)) &&
        !ownsHorizontalTouch(event.target, event.currentTarget)
          ? { x: point.clientX, y: point.clientY, recognized: false }
          : null
    },
    onTouchMove(event: ReactTouchEvent<HTMLElement>) {
      const point = event.touches[0]
      if (!start.current) return
      if (event.touches.length !== 1) {
        start.current = null
      } else if (!start.current.recognized) {
        const dx = point.clientX - start.current.x
        const dy = point.clientY - start.current.y
        if (isVerticalDrag(dx, dy)) start.current = null
        // An edge opening stays committed if the finger drifts before lift-off.
        else if (startsAtEdge) start.current.recognized = horizontalGesture(dx, dy, direction)
      }
    },
    onTouchCancel() {
      start.current = null
    },
    onTouchEnd(event: ReactTouchEvent<HTMLElement>) {
      const from = start.current
      const to = event.changedTouches[0]
      start.current = null
      if (from && to && !event.currentTarget.closest('[inert]') &&
          (from.recognized || horizontalGesture(to.clientX - from.x, to.clientY - from.y, direction))) {
        // A handled release must not also tap the backdrop or a newly exposed control.
        event.preventDefault()
        onSwipe()
      }
    }
  }
}
