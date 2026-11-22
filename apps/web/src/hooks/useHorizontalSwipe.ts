import { useRef, type TouchEvent } from 'react'
import { horizontalGesture, isVerticalDrag, ownsHorizontalTouch } from '@/lib/horizontalGesture'

export function useHorizontalSwipe(
  direction: 'left' | 'right',
  onSwipe: () => void,
  startsAtEdge?: (event: TouchEvent<HTMLElement>) => boolean
) {
  const start = useRef<{ x: number; y: number; recognized: boolean } | null>(null)
  return {
    onTouchStart(event: TouchEvent<HTMLElement>) {
      const point = event.touches[0]
      start.current =
        event.touches.length === 1 &&
        event.currentTarget.contains(event.target as Node) &&
        (!startsAtEdge || startsAtEdge(event)) &&
        !ownsHorizontalTouch(event.target, event.currentTarget)
          ? { x: point.clientX, y: point.clientY, recognized: false }
          : null
    },
    onTouchMove(event: TouchEvent<HTMLElement>) {
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
    onTouchEnd(event: TouchEvent<HTMLElement>) {
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
