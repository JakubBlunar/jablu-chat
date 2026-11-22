import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { createPortal } from 'react-dom'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import { useBackGestureClose } from '@/hooks/useBackGestureClose'
import { useDialogName } from '@/hooks/useDialogName'

const SWIPE_DISMISS_DISTANCE = 60
const SWIPE_SLOP = 8

interface BottomSheetProps {
  open: boolean
  onClose: () => void
  children: React.ReactNode
  zIndex?: number
  /** Max height in dvh. Default 70. */
  maxHeightDvh?: number
  /**
   * When true (default), the sheet body scrolls as one block.
   * When false, the body is a flex column with overflow hidden so children can own scrolling (e.g. tall channel panel).
   */
  bodyScrollable?: boolean
  closeOnEscape?: boolean
  'aria-label'?: string
}

export function BottomSheet({
  open,
  onClose,
  children,
  zIndex = 100,
  maxHeightDvh = 70,
  bodyScrollable = true,
  closeOnEscape = true,
  'aria-label': label
}: BottomSheetProps) {
  const { t } = useTranslation('common')
  const [visible, setVisible] = useState(false)
  const [ready, setReady] = useState(false)
  const [dragOffset, setDragOffset] = useState(0)
  const sheetRef = useRef<HTMLDivElement>(null)
  const backdropTouchStarted = useRef(false)
  const swipeStart = useRef<{ pointerId: number; x: number; y: number } | null>(null)
  const handleMoved = useRef(false)
  const name = useDialogName(sheetRef, open, children, label)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    if (open) {
      const frame = requestAnimationFrame(() => setVisible(true))
      const timer = setTimeout(() => setReady(true), 300)
      return () => {
        clearTimeout(timer)
        cancelAnimationFrame(frame)
      }
    }
    clearTimeout(closeTimer.current)
    closeTimer.current = undefined
    swipeStart.current = null
    handleMoved.current = false
    setDragOffset(0)
    setVisible(false)
    setReady(false)
  }, [open])

  const close = useCallback(() => {
    if (closeTimer.current) return
    swipeStart.current = null
    setDragOffset(0)
    setVisible(false)
    closeTimer.current = setTimeout(() => {
      closeTimer.current = undefined
      onClose()
    }, 200)
  }, [onClose])
  useFocusTrap(sheetRef, open, closeOnEscape ? close : undefined)
  useBackGestureClose(open, close, closeOnEscape)
  useEffect(() => () => clearTimeout(closeTimer.current), [])

  function updateSwipe(event: PointerEvent<HTMLButtonElement>) {
    const start = swipeStart.current
    if (!start || event.pointerId !== start.pointerId) return
    const x = Math.abs(event.clientX - start.x)
    const y = event.clientY - start.y
    if (Math.max(x, Math.abs(y)) > SWIPE_SLOP) handleMoved.current = true
    return y > SWIPE_SLOP && y > x * 1.5 ? y : 0
  }

  function resetSwipe(event: PointerEvent<HTMLButtonElement>) {
    if (event.pointerId !== swipeStart.current?.pointerId) return
    swipeStart.current = null
    setDragOffset(0)
  }

  if (!open) return null

  return createPortal(
    <div
      ref={sheetRef}
      className={`fixed inset-0 flex items-end justify-center bg-black/70 backdrop-blur-sm`}
      style={{ zIndex }}
      role="dialog"
      aria-modal="true"
      {...name}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onTouchStart={(e) => {
        e.stopPropagation()
        backdropTouchStarted.current = ready && e.target === e.currentTarget
      }}
      onTouchEnd={(e) => {
        e.stopPropagation()
        if (e.target === e.currentTarget) {
          // A sheet opened by a hold can receive the end of a gesture that
          // began behind it. Ignore that release and its compatibility click.
          e.preventDefault()
          if (backdropTouchStarted.current) close()
        }
        backdropTouchStarted.current = false
      }}
      onClick={(e) => {
        e.stopPropagation()
        if (ready && e.target === e.currentTarget) close()
      }}
    >
      <div
        className={`flex w-full max-w-lg flex-col rounded-t-2xl bg-surface-dark pb-4 shadow-2xl ring-1 ring-white/10 ${dragOffset ? 'transition-none' : 'transition-transform duration-200'} ${visible ? 'translate-y-0' : 'translate-y-full'} ${bodyScrollable ? '' : 'overflow-hidden'}`}
        style={{
          translate: dragOffset ? `0 ${dragOffset}px` : undefined,
          maxHeight: `${maxHeightDvh}dvh`,
          ...(bodyScrollable
            ? {}
            : {
                height: `min(${maxHeightDvh}dvh, calc(100dvh - env(safe-area-inset-bottom, 0px)))`
              }),
          paddingBottom: 'max(1rem, env(safe-area-inset-bottom))'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          aria-label={t('close')}
          className="flex min-h-11 shrink-0 touch-none items-center justify-center py-3"
          onPointerDown={(event) => {
            if (!event.isPrimary || event.button !== 0) return
            handleMoved.current = false
            if (event.pointerType !== 'touch' || !visible) return
            swipeStart.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY }
          }}
          onPointerMove={(event) => {
            const offset = updateSwipe(event)
            if (offset !== undefined) setDragOffset(offset)
          }}
          onPointerUp={(event) => {
            const offset = updateSwipe(event)
            resetSwipe(event)
            if (offset !== undefined && offset >= SWIPE_DISMISS_DISTANCE) close()
          }}
          onPointerCancel={resetSwipe}
          onLostPointerCapture={resetSwipe}
          onClick={(event) => {
            // A touch drag can still produce a click on the handle.
            if (event.detail === 0 || !handleMoved.current) close()
          }}
        >
          <div className="h-1 w-10 rounded-full bg-gray-600" />
        </button>
        {bodyScrollable ? (
          <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">{children}</div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
        )}
      </div>
    </div>,
    document.body
  )
}
