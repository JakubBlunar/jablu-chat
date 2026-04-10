import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { createPortal } from 'react-dom'

interface BottomSheetProps {
  open: boolean
  onClose: () => void
  children: React.ReactNode
  zIndex?: number
}

export function BottomSheet({ open, onClose, children, zIndex = 100 }: BottomSheetProps) {
  const { t } = useTranslation('common')
  const [visible, setVisible] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => setVisible(true))
      const timer = setTimeout(() => setReady(true), 300)
      return () => clearTimeout(timer)
    }
    setVisible(false)
    setReady(false)
  }, [open])

  const close = useCallback(() => {
    setVisible(false)
    setTimeout(onClose, 200)
  }, [onClose])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, close])

  if (!open) return null

  return createPortal(
    <div
      className={`fixed inset-0 flex items-end justify-center bg-black/70 backdrop-blur-sm`}
      style={{ zIndex }}
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onTouchEnd={(e) => {
        e.stopPropagation()
        if (ready && e.target === e.currentTarget) {
          e.preventDefault()
          close()
        }
      }}
      onClick={(e) => {
        e.stopPropagation()
        if (ready && e.target === e.currentTarget) close()
      }}
    >
      <div
        className={`flex w-full max-w-lg flex-col rounded-t-2xl bg-surface-dark pb-4 shadow-2xl ring-1 ring-white/10 transition-transform duration-200 ${visible ? 'translate-y-0' : 'translate-y-full'}`}
        style={{ maxHeight: '70dvh', paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          aria-label={t('close')}
          onClick={close}
          className="flex shrink-0 justify-center py-3"
        >
          <div className="h-1 w-10 rounded-full bg-gray-600" />
        </button>
        <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
          {children}
        </div>
      </div>
    </div>,
    document.body
  )
}
