import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

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
    <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true">
      <div
        className={`absolute inset-0 bg-black/60 transition-opacity duration-200 ${
          animating ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={drawerRef}
        className={`absolute top-0 ${side === 'left' ? 'left-0' : 'right-0'} h-full ${width} transform transition-transform duration-200 ease-out ${translate}`}
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
