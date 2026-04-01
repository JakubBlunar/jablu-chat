import { useCallback, useEffect, useState } from 'react'
import type { StorageAudit, StorageStats } from '../adminTypes'
import { adminFetch } from '../adminApi'
import { fmtBytes, fmtDate } from '../adminFormatters'
import { Button, Spinner } from '@/components/ui'

function StorageStatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-surface-darkest p-3">
      <p className="text-xs text-gray-400">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-white">{value}</p>
    </div>
  )
}

function AuditRow({ label, count, bytes }: { label: string; count: number; bytes: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-gray-400">
        {label} <span className="text-gray-500">({count.toLocaleString()} items)</span>
      </span>
      <span className="font-medium text-gray-300">{fmtBytes(Number(bytes))}</span>
    </div>
  )
}

function AuditStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: 'bg-gray-600/30 text-gray-400',
    completed: 'bg-emerald-600/20 text-emerald-400',
    executing: 'bg-amber-600/20 text-amber-400',
    executed: 'bg-blue-600/20 text-blue-400',
    failed: 'bg-red-600/20 text-red-400'
  }
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[status] ?? styles.pending}`}>{status}</span>
  )
}

export function StorageTab() {
  const [stats, setStats] = useState<StorageStats | null>(null)
  const [audits, setAudits] = useState<StorageAudit[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [auditing, setAuditing] = useState(false)
  const [cleaningId, setCleaningId] = useState<string | null>(null)
  const [confirmCleanupId, setConfirmCleanupId] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const [s, a] = await Promise.all([
        adminFetch<StorageStats>('/api/admin/storage'),
        adminFetch<StorageAudit[]>('/api/admin/storage/audits')
      ])
      setStats(s)
      setAudits(a)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  const handleRunAudit = async () => {
    setAuditing(true)
    setError('')
    try {
      const audit = await adminFetch<StorageAudit>('/api/admin/storage/audit', {
        method: 'POST'
      })
      setAudits((prev) => [audit, ...prev.filter((a) => a.id !== audit.id)])
      const s = await adminFetch<StorageStats>('/api/admin/storage')
      setStats(s)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Audit failed')
    } finally {
      setAuditing(false)
    }
  }

  const handleCleanup = async (auditId: string) => {
    setCleaningId(auditId)
    setError('')
    try {
      const updated = await adminFetch<StorageAudit>(`/api/admin/storage/cleanup/${auditId}`, { method: 'POST' })
      setAudits((prev) => prev.map((a) => (a.id === updated.id ? updated : a)))
      const s = await adminFetch<StorageStats>('/api/admin/storage')
      setStats(s)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Cleanup failed')
    } finally {
      setCleaningId(null)
      setConfirmCleanupId(null)
    }
  }

  const handleDeleteAudit = async (id: string) => {
    try {
      await adminFetch(`/api/admin/storage/audits/${id}`, { method: 'DELETE' })
      setAudits((prev) => prev.filter((a) => a.id !== id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-gray-400">
        <Spinner size="md" />
        <p className="text-sm">Loading storage info…</p>
      </div>
    )
  }

  const usagePercent = stats ? Math.min(100, (stats.dirSize.total / stats.limitBytes) * 100) : 0
  const usageColor = usagePercent > 90 ? 'bg-red-500' : usagePercent > 70 ? 'bg-amber-500' : 'bg-emerald-500'

  const latestCompleted = audits.find((a) => a.status === 'completed')

  return (
    <>
      {error && (
        <div className="mb-4 rounded-md bg-red-900/30 px-4 py-3 text-sm text-red-300 ring-1 ring-red-500/30">
          {error}
        </div>
      )}

      {stats && (
        <div className="rounded-lg bg-surface-dark p-5 ring-1 ring-white/10">
          <h2 className="text-lg font-semibold">Storage Usage</h2>

          <div className="mt-3">
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-gray-300">
                {fmtBytes(stats.dirSize.total)} / {fmtBytes(stats.limitBytes)}
              </span>
              <span className="text-gray-400">{usagePercent.toFixed(1)}%</span>
            </div>
            <div className="mt-1.5 h-3 w-full overflow-hidden rounded-full bg-surface-darkest">
              <div
                className={`h-full rounded-full transition-all ${usageColor}`}
                style={{ width: `${usagePercent}%` }}
              />
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StorageStatCard label="Avatars" value={fmtBytes(stats.dirSize.avatars)} />
            <StorageStatCard label="Attachments" value={fmtBytes(stats.dirSize.attachments)} />
            <StorageStatCard label="Thumbnails" value={fmtBytes(stats.dirSize.thumbnails)} />
            <StorageStatCard label="Other" value={fmtBytes(stats.dirSize.other)} />
          </div>

          <div className="mt-3 grid grid-cols-3 gap-3">
            <StorageStatCard label="Total Attachments" value={stats.attachmentCount.toLocaleString()} />
            <StorageStatCard label="Total Messages" value={stats.messageCount.toLocaleString()} />
            <StorageStatCard label="Orphaned Attachments" value={stats.orphanedAttachments.toLocaleString()} />
          </div>
        </div>
      )}

      <div className="mt-4 flex items-center gap-3">
        <Button onClick={() => void handleRunAudit()} disabled={auditing} loading={auditing}>
          {auditing ? 'Running Audit…' : 'Run Audit'}
        </Button>
        {auditing && <span className="text-sm text-gray-400">Scanning storage, this may take a moment…</span>}
      </div>

      {latestCompleted && (
        <div className="mt-4 rounded-lg bg-surface-dark p-5 ring-1 ring-white/10">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Latest Audit Report</h3>
            <span className="rounded-full bg-emerald-600/20 px-2.5 py-0.5 text-xs font-medium text-emerald-400">
              Ready for cleanup
            </span>
          </div>
          <p className="mt-1 text-xs text-gray-500">Scanned on {fmtDate(latestCompleted.createdAt)}</p>

          <div className="mt-3 space-y-2">
            <AuditRow
              label="Orphaned uploads"
              count={latestCompleted.orphanedCount}
              bytes={latestCompleted.orphanedBytes}
            />
            <AuditRow
              label="Disk orphans"
              count={latestCompleted.diskOrphanCount}
              bytes={latestCompleted.diskOrphanBytes}
            />
            <AuditRow
              label="Old attachments"
              count={latestCompleted.attachmentCount}
              bytes={latestCompleted.attachmentBytes}
            />
            <AuditRow
              label="Old forum posts"
              count={latestCompleted.forumPostCount}
              bytes={latestCompleted.forumPostBytes}
            />
            <AuditRow label="Old messages" count={latestCompleted.messageCount} bytes={latestCompleted.messageBytes} />
            <div className="border-t border-white/10 pt-2">
              <div className="flex items-baseline justify-between">
                <span className="font-semibold text-white">Total freeable</span>
                <span className="text-lg font-bold text-emerald-400">
                  {fmtBytes(Number(latestCompleted.totalFreeable))}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-4">
            {confirmCleanupId === latestCompleted.id ? (
              <div className="flex items-center gap-3 rounded-md bg-red-900/20 p-3 ring-1 ring-red-500/30">
                <span className="text-sm text-red-300">This will permanently delete files. Continue?</span>
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  disabled={cleaningId === latestCompleted.id}
                  onClick={() => void handleCleanup(latestCompleted.id)}
                >
                  {cleaningId === latestCompleted.id ? 'Cleaning…' : 'Confirm Cleanup'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="text-sm text-gray-400 hover:text-white"
                  onClick={() => setConfirmCleanupId(null)}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <Button type="button" variant="danger" onClick={() => setConfirmCleanupId(latestCompleted.id)}>
                Execute Cleanup
              </Button>
            )}
          </div>
        </div>
      )}

      {audits.length > 0 && (
        <div className="mt-4">
          <h3 className="text-lg font-semibold">Audit History</h3>
          <div className="mt-2 overflow-hidden rounded-lg ring-1 ring-white/10">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-dark text-xs uppercase text-gray-400">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Storage Used</th>
                  <th className="px-4 py-3">Freeable</th>
                  <th className="px-4 py-3">Freed</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {audits.map((audit) => (
                  <tr key={audit.id} className="bg-surface-dark/50">
                    <td className="whitespace-nowrap px-4 py-3 text-gray-300">{fmtDate(audit.createdAt)}</td>
                    <td className="px-4 py-3">
                      <AuditStatusBadge status={audit.status} />
                    </td>
                    <td className="px-4 py-3 text-gray-300">{fmtBytes(Number(audit.totalSizeBytes))}</td>
                    <td className="px-4 py-3 text-gray-300">{fmtBytes(Number(audit.totalFreeable))}</td>
                    <td className="px-4 py-3 text-gray-300">
                      {audit.freedBytes ? fmtBytes(Number(audit.freedBytes)) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        className="text-gray-500 hover:text-red-400"
                        onClick={() => void handleDeleteAudit(audit.id)}
                      >
                        Dismiss
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  )
}
