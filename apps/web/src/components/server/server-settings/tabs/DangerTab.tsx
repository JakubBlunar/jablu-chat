import { useCallback, useState } from 'react'
import { Button, Input } from '@/components/ui'
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
          <label className="text-xs text-gray-400" htmlFor="danger-delete-confirm">
            Type <strong className="text-white">{server.name}</strong> to confirm
          </label>
          <Input
            id="danger-delete-confirm"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={server.name}
            className="focus:!ring-red-500"
          />
          <Button
            type="button"
            variant="danger"
            disabled={confirmText !== server.name}
            loading={deleting}
            onClick={handleDelete}
          >
            Delete Server
          </Button>
          {deleteError && <p className="mt-2 text-xs text-red-400">{deleteError}</p>}
        </div>
      </div>
    </div>
  )
}
