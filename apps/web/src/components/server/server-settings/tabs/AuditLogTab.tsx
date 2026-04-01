import { useCallback, useEffect, useState } from 'react'
import { InlineAlert } from '@/components/ui/InlineAlert'
import { api, type AuditLogEntry } from '@/lib/api'
import { formatFullDateTime } from '@/lib/format-time'
import type { Server } from '@/stores/server.store'

export function AuditLogTab({ server }: { server: Server }) {
  const [entries, setEntries] = useState<AuditLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(false)
  const [logError, setLogError] = useState<string | null>(null)

  const fetchLog = useCallback(
    async (cursor?: string) => {
      setLoading(true)
      setLogError(null)
      try {
        const data = await api.getAuditLog(server.id, 50, cursor)
        if (cursor) {
          setEntries((prev) => [...prev, ...data.entries])
        } else {
          setEntries(data.entries)
        }
        setHasMore(data.hasMore)
      } catch {
        setLogError('Failed to load audit log')
      } finally {
        setLoading(false)
      }
    },
    [server.id]
  )

  useEffect(() => {
    void fetchLog()
  }, [fetchLog])

  const loadMore = useCallback(() => {
    const last = entries[entries.length - 1]
    if (last) void fetchLog(last.createdAt)
  }, [entries, fetchLog])

  return (
    <div className="space-y-3">
      {logError && <InlineAlert variant="error">{logError}</InlineAlert>}
      {entries.length === 0 && !loading ? (
        <p className="text-center text-sm text-gray-500">No audit log entries yet.</p>
      ) : (
        <div className="space-y-1">
          {entries.map((e) => (
            <div key={e.id} className="flex items-start gap-3 rounded-md px-3 py-2 hover:bg-white/[0.04]">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-white">
                  <span className="font-semibold text-primary">
                    {e.actor?.displayName ?? e.actor?.username ?? 'Unknown'}
                  </span>{' '}
                  <span className="font-medium">{e.action}</span>
                  {e.targetType && <span className="text-gray-400"> &middot; {e.targetType}</span>}
                </p>
                {e.details && <p className="mt-0.5 text-xs text-gray-500">{e.details}</p>}
              </div>
              <time className="shrink-0 text-xs text-gray-500">{formatFullDateTime(e.createdAt)}</time>
            </div>
          ))}
        </div>
      )}
      {loading && <p className="text-center text-sm text-gray-400">Loading…</p>}
      {hasMore && !loading && (
        <button
          type="button"
          onClick={loadMore}
          className="mx-auto block rounded bg-surface-dark px-4 py-2 text-xs text-gray-300 ring-1 ring-white/10 hover:bg-surface-selected"
        >
          Load more
        </button>
      )}
    </div>
  )
}
