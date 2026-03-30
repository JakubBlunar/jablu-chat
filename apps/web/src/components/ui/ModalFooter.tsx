import { Button } from './Button'

export type ModalFooterProps = {
  onCancel: () => void
  onConfirm: () => void
  cancelLabel?: string
  confirmLabel?: string
  loading?: boolean
  disabled?: boolean
  danger?: boolean
  className?: string
}

export function ModalFooter({
  onCancel,
  onConfirm,
  cancelLabel = 'Cancel',
  confirmLabel = 'Confirm',
  loading = false,
  disabled = false,
  danger = false,
  className = '',
}: ModalFooterProps) {
  return (
    <div className={`mt-6 flex justify-end gap-2 ${className}`}>
      <Button variant="secondary" onClick={onCancel} disabled={loading}>
        {cancelLabel}
      </Button>
      <Button
        variant={danger ? 'danger' : 'primary'}
        onClick={onConfirm}
        disabled={disabled}
        loading={loading}
      >
        {confirmLabel}
      </Button>
    </div>
  )
}
