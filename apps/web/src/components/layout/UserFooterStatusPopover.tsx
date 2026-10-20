import type { RefObject } from 'react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ModalOverlay } from '@/components/ui/ModalOverlay'
import { StatusPickerCore } from '@/components/user/StatusPickerCore'
import { useIsMobile } from '@/hooks/useMobile'
import { useFocusTrap } from '@/hooks/useFocusTrap'

const POPOVER_W = 280

/** Fixed popover anchored above the footer avatar (sidebar bottom). */
function placeAboveAvatar(anchorRect: DOMRect) {
  const pad = 8
  let left = anchorRect.left + anchorRect.width / 2 - POPOVER_W / 2
  left = Math.max(pad, Math.min(left, window.innerWidth - POPOVER_W - pad))
  const bottom = window.innerHeight - anchorRect.top + pad
  return { left, bottom }
}

type Props = {
  open: boolean
  onClose: () => void
  anchorRef: RefObject<HTMLElement | null>
  onEditFullSettings: () => void
}

export function UserFooterStatusPopover({ open, onClose, anchorRef, onEditFullSettings }: Props) {
  const { t } = useTranslation('settings')
  const isMobile = useIsMobile()
  const popoverRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; bottom: number } | null>(null)
  useFocusTrap(popoverRef, open && !isMobile && pos !== null, onClose)

  useLayoutEffect(() => {
    if (!open || isMobile) return
    const el = anchorRef.current
    if (!el) return
    setPos(placeAboveAvatar(el.getBoundingClientRect()))
  }, [open, isMobile, anchorRef])

  useEffect(() => {
    if (!open) return
    const onResize = () => {
      const el = anchorRef.current
      if (el && !isMobile) setPos(placeAboveAvatar(el.getBoundingClientRect()))
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [open, isMobile, anchorRef])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Element
      if (t.closest('[data-status-picker]')) return
      if (anchorRef.current?.contains(t)) return
      onClose()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open, onClose, anchorRef])

  if (!open) return null

  if (isMobile) {
    return (
      <ModalOverlay onClose={onClose} maxWidth="max-w-sm" zIndex="z-[250]">
        <div data-status-picker="mobile-shell">
          <h2 className="text-lg font-semibold text-white">{t('status.setStatus')}</h2>
          <p className="mt-0.5 text-sm text-gray-400">{t('status.chooseHowOthersSeeYou')}</p>
          <div className="mt-4 border-t border-white/10 pt-4">
            <StatusPickerCore variant="compact" onRequestClose={onClose} onEditFullSettings={onEditFullSettings} />
          </div>
        </div>
      </ModalOverlay>
    )
  }

  if (pos == null) return null

  return (
    <div
      ref={popoverRef}
      data-status-picker="popover"
      className="fixed z-[250] max-h-[min(420px,calc(100vh-32px))] w-[280px] overflow-y-auto overscroll-contain rounded-xl border border-white/10 bg-surface-dark p-3 shadow-2xl ring-1 ring-black/30"
      style={{ left: pos.left, bottom: pos.bottom }}
      role="dialog"
      aria-modal="true"
      aria-label={t('status.setStatus')}
    >
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{t('status.setStatus')}</p>
      <StatusPickerCore variant="compact" onRequestClose={onClose} onEditFullSettings={onEditFullSettings} />
    </div>
  )
}
