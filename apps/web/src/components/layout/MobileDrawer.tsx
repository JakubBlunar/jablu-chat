import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import { useBackGestureClose } from '@/hooks/useBackGestureClose'
import { useIsMobile } from '@/hooks/useMobile'

type Props = {
  open: boolean
  onClose: () => void
  side: 'left' | 'right'
  width?: string
  children: React.ReactNode
}

export function MobileDrawer({ open, onClose, side, width = 'w-72', children }: Props) {
  const [visible, setVisible] = useState(false)
  const [animating, setAnimating] = useState(false)
  const touchStartRef = useRef<number | null>(null)
  const touchDeltaRef = useRef(0)
  const drawerRef = useRef<HTMLDivElement>(null)
  const isMobile = useIsMobile()

  useFocusTrap(drawerRef, open)
  useBackGestureClose(open, onClose, isMobile)

  useEffect(() => {
    if (open) {
      setVisible(true)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setAnimating(true))
      })
    } else {
      setAnimating(false)
      const t = setTimeout(() => setVisible(false), 200)
      return () => clearTimeout(t)
    }
  }, [open])

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartRef.current = e.touches[0].clientX
    touchDeltaRef.current = 0
  }, [])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (touchStartRef.current === null) return
    touchDeltaRef.current = e.touches[0].clientX - touchStartRef.current
  }, [])

  const handleTouchEnd = useCallback(() => {
    const d = touchDeltaRef.current
    const threshold = 60
    if (side === 'left' && d < -threshold) onClose()
    if (side === 'right' && d > threshold) onClose()
    touchStartRef.current = null
    touchDeltaRef.current = 0
  }, [side, onClose])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!visible) return null

  const translate = animating ? 'translate-x-0' : side === 'left' ? '-translate-x-full' : 'translate-x-full'

  return createPortal(
    // The container is non-interactive by default so a transparent (opacity-0) backdrop
    // can never swallow touches — critical on iOS standalone PWA where the close timer
    // can be throttled, leaving an invisible full-screen layer that blocks all input.
    <div className="pointer-events-none fixed inset-0 z-[80]" role="dialog" aria-modal="true" onContextMenu={(e) => e.preventDefault()}>
      <div
        className={`absolute inset-0 bg-black/60 transition-opacity duration-200 ${
          animating ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={drawerRef}
        className={`pointer-events-auto absolute top-0 ${side === 'left' ? 'left-0' : 'right-0'} h-full ${width} transform transition-transform duration-200 ease-out ${translate}`}
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {children}
      </div>
    </div>,
    document.body
  )
}
