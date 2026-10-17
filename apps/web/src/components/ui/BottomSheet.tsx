import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { createPortal } from 'react-dom'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import { useBackGestureClose } from '@/hooks/useBackGestureClose'
import { useDialogName } from '@/hooks/useDialogName'

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
  const sheetRef = useRef<HTMLDivElement>(null)
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
    setVisible(false)
    setReady(false)
  }, [open])

  const close = useCallback(() => {
    if (closeTimer.current) return
    setVisible(false)
    closeTimer.current = setTimeout(() => {
      closeTimer.current = undefined
      onClose()
    }, 200)
  }, [onClose])
  useFocusTrap(sheetRef, open, closeOnEscape ? close : undefined)
  useBackGestureClose(open, close, closeOnEscape)
  useEffect(() => () => clearTimeout(closeTimer.current), [])

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
        className={`flex w-full max-w-lg flex-col rounded-t-2xl bg-surface-dark pb-4 shadow-2xl ring-1 ring-white/10 transition-transform duration-200 ${visible ? 'translate-y-0' : 'translate-y-full'} ${bodyScrollable ? '' : 'overflow-hidden'}`}
        style={{
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
          onClick={close}
          className="flex min-h-11 shrink-0 items-center justify-center py-3"
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
