import { useRef, type TouchEvent } from 'react'
import { horizontalGesture, isVerticalDrag, ownsHorizontalTouch } from '@/lib/horizontalGesture'

export function useHorizontalSwipe(
  direction: 'left' | 'right',
  onSwipe: () => void,
  canStart?: (event: TouchEvent<HTMLElement>) => boolean
) {
  const start = useRef<{ x: number; y: number } | null>(null)
  return {
    onTouchStart(event: TouchEvent<HTMLElement>) {
      const point = event.touches[0]
      start.current =
        event.touches.length === 1 &&
        event.currentTarget.contains(event.target as Node) &&
        (!canStart || canStart(event)) &&
        !ownsHorizontalTouch(event.target, event.currentTarget)
          ? { x: point.clientX, y: point.clientY }
          : null
    },
    onTouchMove(event: TouchEvent<HTMLElement>) {
      const point = event.touches[0]
      if (!start.current) return
      if (event.touches.length !== 1 || isVerticalDrag(point.clientX - start.current.x, point.clientY - start.current.y)) {
        start.current = null
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
          horizontalGesture(to.clientX - from.x, to.clientY - from.y, direction)) {
        onSwipe()
      }
    }
  }
}
