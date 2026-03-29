import { useCallback, useState } from 'react'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth.store'
import type { Server } from '@/stores/server.store'
import { useServerStore } from '@/stores/server.store'

export function DangerTab({ server, onClose }: { server: Server; onClose: () => void }) {
  const currentUser = useAuthStore((s) => s.user)
  const removeServer = useServerStore((s) => s.removeServer)
  const [confirmText, setConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const isOwner = currentUser?.id === server.ownerId

  const handleDelete = useCallback(async () => {
    if (confirmText !== server.name) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await api.deleteServer(server.id)
      removeServer(server.id)
      onClose()
    } catch {
      setDeleteError('Failed to delete server')
      setDeleting(false)
    }
  }, [confirmText, server, removeServer, onClose])

  if (!isOwner) {
    return <p className="text-sm text-gray-400">Only the server owner can delete this server.</p>
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-red-500/40 bg-red-500/10 p-4">
        <h3 className="text-sm font-semibold text-red-400">Delete Server</h3>
        <p className="mt-1 text-sm text-gray-300">
          This will permanently delete <strong className="text-white">{server.name}</strong>, all channels, messages,
          and uploaded files. This action cannot be undone.
        </p>
        <div className="mt-4 space-y-2">
          <label className="text-xs text-gray-400">
            Type <strong className="text-white">{server.name}</strong> to confirm
          </label>
          <input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={server.name}
            className="w-full rounded-md border border-white/10 bg-surface-darkest px-3 py-2 text-sm text-white outline-none focus:border-red-500"
          />
          <button
            type="button"
            disabled={confirmText !== server.name || deleting}
            onClick={handleDelete}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-50"
          >
            {deleting ? 'Deleting…' : 'Delete Server'}
          </button>
          {deleteError && <p className="mt-2 text-xs text-red-400">{deleteError}</p>}
        </div>
      </div>
    </div>
  )
}
