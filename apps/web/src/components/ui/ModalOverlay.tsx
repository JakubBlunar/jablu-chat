import { useEffect, useRef } from 'react'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import { useIsMobile } from '@/hooks/useMobile'

type Props = {
  onClose: () => void
  children: React.ReactNode
  maxWidth?: string
  zIndex?: string
  className?: string
  noPadding?: boolean
}

export function ModalOverlay({
  onClose,
  children,
  maxWidth = 'max-w-md',
  zIndex = 'z-50',
  className = '',
  noPadding = false
}: Props) {
  const isMobile = useIsMobile()
  const dialogRef = useRef<HTMLDivElement>(null)
  useFocusTrap(dialogRef, true)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      className={`fixed inset-0 ${zIndex} flex justify-center p-4 ${isMobile ? 'items-start bg-black/70 backdrop-blur-sm' : 'items-center bg-black/80'}`}
      role="none"
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onTouchEnd={(e) => {
        e.stopPropagation()
        if (e.target === e.currentTarget) {
          e.preventDefault()
          onClose()
        }
      }}
      onClick={(e) => {
        e.stopPropagation()
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        className={`w-full max-h-[90vh] overflow-y-auto overscroll-contain rounded-xl bg-surface-dark shadow-2xl ring-1 ring-white/10 ${maxWidth} ${noPadding ? '' : 'p-6'} ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}
