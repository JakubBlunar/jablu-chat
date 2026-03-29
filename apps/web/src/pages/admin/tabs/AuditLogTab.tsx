import { useCallback, useEffect, useState } from 'react'
import type { AdminServer, AuditLogEntry } from '../adminTypes'
import { adminFetch } from '../adminApi'
import { fmtDateTime } from '../adminFormatters'
import { Empty } from '../AdminShared'

export function AuditLogTab({ servers }: { servers: AdminServer[] }) {
  const [logs, setLogs] = useState<AuditLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [filterServerId, setFilterServerId] = useState('')

  const fetchLogs = useCallback(
    async (cursor?: string) => {
      const isFirstPage = !cursor
      if (isFirstPage) setLoading(true)
      else setLoadingMore(true)
      setError('')
      try {
        const params = new URLSearchParams()
        if (filterServerId) params.set('serverId', filterServerId)
        if (cursor) params.set('cursor', cursor)
        params.set('limit', '50')
        const data = await adminFetch<{
          logs: AuditLogEntry[]
          nextCursor: string | null
        }>(`/api/admin/audit-logs?${params}`)
        if (isFirstPage) setLogs(data.logs)
        else setLogs((prev) => [...prev, ...data.logs])
        setNextCursor(data.nextCursor)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load')
      } finally {
        setLoading(false)
        setLoadingMore(false)
      }
    },
    [filterServerId]
  )

  useEffect(() => {
    void fetchLogs()
  }, [fetchLogs])

  const actionColor: Record<string, string> = {
    'channel:create': 'bg-green-900/40 text-green-300',
    'channel:update': 'bg-blue-900/40 text-blue-300',
    'channel:delete': 'bg-red-900/40 text-red-300',
    'channel:reorder': 'bg-purple-900/40 text-purple-300',
    'member:kick': 'bg-red-900/40 text-red-300',
    'member:ban': 'bg-red-900/40 text-red-300',
    'member:role_change': 'bg-yellow-900/40 text-yellow-300',
    'server:update': 'bg-blue-900/40 text-blue-300',
    'emoji:create': 'bg-green-900/40 text-green-300',
    'emoji:delete': 'bg-red-900/40 text-red-300',
    'webhook:create': 'bg-green-900/40 text-green-300',
    'webhook:delete': 'bg-red-900/40 text-red-300'
  }
  const defaultBadge = 'bg-gray-800 text-gray-300'

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <select
          value={filterServerId}
          onChange={(e) => setFilterServerId(e.target.value)}
          className="rounded-md bg-surface-darkest px-3 py-2 text-sm text-white outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-primary"
        >
          <option value="">All servers</option>
          {servers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="rounded-md bg-red-900/30 px-4 py-2 text-sm text-red-300 ring-1 ring-red-500/30">{error}</div>
      )}

      {loading ? (
        <div className="text-center text-gray-400 py-8">Loading…</div>
      ) : logs.length === 0 ? (
        <Empty>No audit logs found.</Empty>
      ) : (
        <div className="space-y-1">
          {logs.map((log) => (
            <div
              key={log.id}
              className="flex items-start gap-3 rounded-lg bg-surface-dark px-4 py-3 ring-1 ring-white/5"
            >
              <span
                className={`mt-0.5 shrink-0 rounded px-2 py-0.5 text-xs font-semibold ${actionColor[log.action] ?? defaultBadge}`}
              >
                {log.action}
              </span>
              <div className="min-w-0 flex-1 text-sm">
                <span className="font-medium text-white">
                  {log.actor?.displayName ?? log.actor?.username ?? 'Unknown'}
                </span>
                <span className="text-gray-400"> in </span>
                <span className="font-medium text-gray-300">{log.server?.name ?? 'Deleted Server'}</span>
                {log.details && <p className="mt-0.5 text-gray-500 break-all">{log.details}</p>}
              </div>
              <time className="shrink-0 text-xs text-gray-500 whitespace-nowrap">
                {fmtDateTime(log.createdAt)}
              </time>
            </div>
          ))}
        </div>
      )}

      {nextCursor && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => void fetchLogs(nextCursor)}
            disabled={loadingMore}
            className="rounded-md bg-white/5 px-4 py-2 text-sm font-medium text-gray-300 transition hover:bg-white/10 disabled:opacity-50"
          >
            {loadingMore ? 'Loading…' : 'Load More'}
          </button>
        </div>
      )}
    </div>
  )
}
