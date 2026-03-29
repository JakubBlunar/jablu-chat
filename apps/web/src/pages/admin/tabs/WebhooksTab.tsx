import { useEffect, useState } from 'react'
import type { AdminWebhook } from '../adminTypes'
import { adminFetch } from '../adminApi'
import { fmtDate } from '../adminFormatters'
import { ConfirmDeleteBtn, Empty } from '../AdminShared'

export function WebhooksTab() {
  const [webhooks, setWebhooks] = useState<AdminWebhook[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    adminFetch<AdminWebhook[]>('/api/admin/webhooks')
      .then(setWebhooks)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    try {
      await adminFetch(`/api/admin/webhooks/${id}`, { method: 'DELETE' })
      setWebhooks((prev) => prev.filter((w) => w.id !== id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setDeletingId(null)
      setConfirmDeleteId(null)
    }
  }

  if (loading) {
    return <div className="text-center text-gray-400 py-8">Loading…</div>
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-md bg-red-900/30 px-4 py-2 text-sm text-red-300 ring-1 ring-red-500/30">{error}</div>
      )}

      {webhooks.length === 0 ? (
        <Empty>No webhooks configured.</Empty>
      ) : (
        webhooks.map((wh) => (
          <div key={wh.id} className="flex items-center gap-4 rounded-lg bg-surface-dark p-4 ring-1 ring-white/10">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-purple-900/40 text-sm font-bold text-purple-300">
              {wh.avatarUrl ? (
                <img src={wh.avatarUrl} alt="" className="h-full w-full rounded-full object-cover" />
              ) : (
                wh.name.charAt(0).toUpperCase()
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-white">{wh.name}</p>
              <p className="text-sm text-gray-400">
                #{wh.channel.name}
                {wh.channel.server && <span className="text-gray-600"> ({wh.channel.server.name})</span>}
              </p>
              <p className="text-xs text-gray-500">
                Created by {wh.createdBy?.username ?? 'Unknown'} &middot; {fmtDate(wh.createdAt)}
              </p>
            </div>
            <ConfirmDeleteBtn
              id={wh.id}
              confirmId={confirmDeleteId}
              deletingId={deletingId}
              onConfirm={() => setConfirmDeleteId(wh.id)}
              onCancel={() => setConfirmDeleteId(null)}
              onDelete={() => void handleDelete(wh.id)}
              label="Delete"
            />
          </div>
        ))
      )}
    </div>
  )
}
