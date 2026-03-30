import { useEffect } from 'react'
import { createPortal } from 'react-dom'

export type LightboxOverlayProps = {
  onClose: () => void
  children: React.ReactNode
}

export function LightboxOverlay({ onClose, children }: LightboxOverlayProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  return createPortal(
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center bg-black/80"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute right-4 top-4 rounded-full bg-black/50 p-2 text-white transition hover:bg-black/70"
        style={{
          marginTop: 'env(safe-area-inset-top, 0px)',
          marginRight: 'env(safe-area-inset-right, 0px)',
        }}
      >
        <svg
          className="h-6 w-6"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path d="M6 18 18 6M6 6l12 12" />
        </svg>
      </button>
      <div onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>,
    document.body,
  )
}
