import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useIsMobile } from '@/hooks/useMobile'
import { ModalOverlay } from '@/components/ui/ModalOverlay'

interface ConfirmDialogProps {
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
  anchorRef?: React.RefObject<HTMLElement | null>
}

export function ConfirmDialog({
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  anchorRef
}: ConfirmDialogProps) {
  const isMobile = useIsMobile()

  if (isMobile || !anchorRef) {
    return createPortal(
      <ModalOverlay onClose={onCancel} maxWidth="max-w-sm" zIndex="z-[120]">
        <p className="text-lg font-semibold text-white">{title}</p>
        <p className="mt-2 text-sm text-gray-300">{description}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg bg-surface-light px-4 py-2 text-sm text-gray-300 transition hover:bg-white/10"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700"
          >
            {confirmLabel}
          </button>
        </div>
      </ModalOverlay>,
      document.body
    )
  }

  return (
    <ConfirmPopover
      title={title}
      description={description}
      confirmLabel={confirmLabel}
      cancelLabel={cancelLabel}
      onConfirm={onConfirm}
      onCancel={onCancel}
      anchorRef={anchorRef}
    />
  )
}

function ConfirmPopover({
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  anchorRef
}: {
  title: string
  description: string
  confirmLabel: string
  cancelLabel: string
  onConfirm: () => void
  onCancel: () => void
  anchorRef: React.RefObject<HTMLElement | null>
}) {
  const popoverRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top?: number; bottom?: number; right: number } | null>(null)

  useEffect(() => {
    if (anchorRef.current) {
      const rect = anchorRef.current.getBoundingClientRect()
      const above = rect.top > 200
      setPos({
        right: window.innerWidth - rect.right,
        ...(above ? { bottom: window.innerHeight - rect.top + 8 } : { top: rect.bottom + 8 })
      })
    }
  }, [anchorRef])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    const onClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onCancel()
      }
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClick)
    }
  }, [onCancel])

  if (!pos) return null

  return createPortal(
    <div
      ref={popoverRef}
      className="fixed z-50 w-64 rounded-lg bg-surface-dark p-3 shadow-xl ring-1 ring-white/10"
      style={pos}
    >
      <p className="text-sm font-semibold text-white">{title}</p>
      <p className="mt-1 text-xs text-gray-400">{description}</p>
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded px-3 py-1 text-xs text-gray-300 transition hover:bg-white/10">
          {cancelLabel}
        </button>
        <button type="button" onClick={onConfirm} className="rounded bg-red-600 px-3 py-1 text-xs font-medium text-white transition hover:bg-red-700">
          {confirmLabel}
        </button>
      </div>
    </div>,
    document.body
  )
}
