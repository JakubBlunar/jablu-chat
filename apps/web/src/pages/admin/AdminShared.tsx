export function ConfirmDeleteBtn({
  id,
  confirmId,
  deletingId,
  onConfirm,
  onCancel,
  onDelete,
  label = 'Delete'
}: {
  id: string
  confirmId: string | null
  deletingId: string | null
  onConfirm: () => void
  onCancel: () => void
  onDelete: () => void
  label?: string
}) {
  if (confirmId === id) {
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onDelete}
          disabled={deletingId === id}
          className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-50"
        >
          {deletingId === id ? 'Deleting…' : 'Confirm'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-3 py-1.5 text-sm text-gray-400 hover:text-white"
        >
          Cancel
        </button>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={onConfirm}
      className="rounded-md px-3 py-1.5 text-sm font-medium text-red-400 transition hover:bg-red-500/10"
    >
      {label}
    </button>
  )
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg bg-surface-dark p-8 text-center text-gray-400 ring-1 ring-white/10">{children}</div>
}
