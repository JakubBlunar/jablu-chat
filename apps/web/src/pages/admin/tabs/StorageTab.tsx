import { useCallback, useEffect, useState } from 'react'
import type { StorageAudit, StorageStats } from '../adminTypes'
import { adminFetch } from '../adminApi'
import { fmtBytes, fmtDate } from '../adminFormatters'
import { Button, Spinner } from '@/components/ui'

type PlanItem = {
  id: string
  sequence: number
  kind: string
  sourceId: string | null
  snapshot: { label: string; createdAt: string | null }
  files: { path: string; size: number }[]
  status: string
}

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
    failed: 'bg-red-600/20 text-red-400',
    audit_failed: 'bg-red-600/20 text-red-400',
    partial: 'bg-amber-600/20 text-amber-400',
    interrupted: 'bg-amber-600/20 text-amber-400',
    superseded: 'bg-gray-600/30 text-gray-400'
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
  const [preview, setPreview] = useState<{ auditId: string; items: PlanItem[]; next: number | null } | null>(null)

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

  const running = audits.some((a) => a.status === 'executing')
  useEffect(() => {
    if (!running) return
    let cancelled = false
    const timer = window.setInterval(() => {
      void adminFetch<StorageAudit[]>('/api/admin/storage/audits')
        .then((next) => {
          if (cancelled) return
          setAudits(next)
          if (!next.some((a) => a.status === 'executing')) void fetchData()
        })
        .catch((e) => {
          if (!cancelled) setError(e instanceof Error ? e.message : 'Progress unavailable; refresh to recover')
        })
    }, 2000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [running, fetchData])

  const handleRunAudit = async (mode: 'pressure' | 'deleted' | 'logs' = 'pressure') => {
    setAuditing(true)
    setError('')
    try {
      const audit = await adminFetch<StorageAudit>(
        `/api/admin/storage/audit${mode === 'pressure' ? '' : `?mode=${mode}`}`,
        {
          method: 'POST'
        }
      )
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
      await fetchData()
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

  const loadPreview = async (id: string, after?: number) => {
    try {
      const page = await adminFetch<{ items: PlanItem[]; next: number | null }>(
        `/api/admin/storage/audits/${id}/items${after === undefined ? '' : `?after=${after}`}`
      )
      setPreview((prev) => ({
        auditId: id,
        items: after !== undefined && prev?.auditId === id ? [...prev.items, ...page.items] : page.items,
        next: page.next
      }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Preview failed')
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

  const usagePercent = stats ? (stats.totalBytes / stats.limitBytes) * 100 : 0
  const usageColor = usagePercent > 90 ? 'bg-red-500' : usagePercent > 70 ? 'bg-amber-500' : 'bg-emerald-500'

  const latestCompleted =
    audits[0]?.status === 'completed' &&
    audits[0]?.planVersion === 1 &&
    !!audits[0].expiresAt &&
    new Date(audits[0].expiresAt).getTime() > Date.now()
      ? audits[0]
      : undefined

  return (
    <>
      {error && (
        <div className="mb-4 rounded-md bg-red-900/30 px-4 py-3 text-sm text-red-300 ring-1 ring-red-500/30">
          {error}
        </div>
      )}

      {stats && (
        <div className="rounded-lg bg-surface-dark p-5 ring-1 ring-white/10">
          <h2 className="text-lg font-semibold">Jablu Instance Storage</h2>
          <p className="mt-1 text-xs text-gray-400">
            Soft budget; uploads continue above it. Cleanup runs only when you confirm a reviewed audit.
          </p>

          <div className="mt-3">
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-gray-300">
                {fmtBytes(stats.totalBytes)} / {fmtBytes(stats.limitBytes)}
              </span>
              <span className="text-gray-400">{usagePercent.toFixed(1)}%</span>
            </div>
            <div className="mt-1.5 h-3 w-full overflow-hidden rounded-full bg-surface-darkest">
              <div
                className={`h-full rounded-full transition-all ${usageColor}`}
                style={{ width: `${Math.min(100, usagePercent)}%` }}
              />
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StorageStatCard label="Avatars" value={fmtBytes(stats.dirSize.avatars)} />
            <StorageStatCard label="Attachments" value={fmtBytes(stats.dirSize.attachments)} />
            <StorageStatCard label="Thumbnails" value={fmtBytes(stats.dirSize.thumbnails)} />
            <StorageStatCard label="Other" value={fmtBytes(stats.dirSize.other)} />
            <StorageStatCard label="Database (allocated)" value={fmtBytes(stats.databaseBytes)} />
            <StorageStatCard label="Log archives" value={fmtBytes(stats.logBytes)} />
            <StorageStatCard label="Other configured storage" value={fmtBytes(stats.extraBytes)} />
            <StorageStatCard label="Cleanup target" value={fmtBytes(stats.targetBytes)} />
          </div>
          <p className="mt-3 text-xs text-gray-400">
            {stats.scope} Database row removal makes space reusable and may not shrink allocated disk usage immediately.
          </p>

          <div className="mt-3 grid grid-cols-3 gap-3">
            <StorageStatCard label="Total Attachments" value={stats.attachmentCount.toLocaleString()} />
            <StorageStatCard label="Total Messages" value={stats.messageCount.toLocaleString()} />
            <StorageStatCard label="Orphaned Attachments" value={stats.orphanedAttachments.toLocaleString()} />
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button onClick={() => void handleRunAudit()} disabled={auditing || running} loading={auditing}>
          {auditing ? 'Running Audit…' : 'Run Audit'}
        </Button>
        <Button onClick={() => void handleRunAudit('deleted')} disabled={auditing || running}>
          Review Deleted Messages
        </Button>
        <Button onClick={() => void handleRunAudit('logs')} disabled={auditing || running}>
          Review Old Logs
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
          <p className="mt-2 text-sm text-gray-300">
            {latestCompleted.mode === 'pressure'
              ? 'Cleanup toward the instance target'
              : latestCompleted.mode === 'deleted'
                ? 'Purge reviewed deleted messages, regardless of storage usage'
                : 'Purge reviewed old log records and closed archives, regardless of storage usage'}
            . Up to {latestCompleted.affectedMessages ?? 0} messages including replies and{' '}
            {latestCompleted.affectedAttachments ?? 0} attachments.
          </p>
          <p className="mt-1 text-xs text-gray-400">
            Expires {fmtDate(latestCompleted.expiresAt!)}. Pinned data{' '}
            {latestCompleted.policy?.protectPinned ? 'protected' : 'eligible'}; archived channels{' '}
            {latestCompleted.policy?.skipArchived ? 'protected' : 'eligible'}.
          </p>
          {latestCompleted.policy && (
            <p className="mt-1 text-xs text-gray-400">
              Live data inactive before {fmtDate(latestCompleted.policy.age)}; unattached uploads before{' '}
              {fmtDate(latestCompleted.policy.orphan)}; old logs before {fmtDate(latestCompleted.policy.logs)}.
            </p>
          )}
          {latestCompleted.planLimited && (
            <p className="mt-2 text-sm text-amber-300">
              This plan reached its item limit. Additional data requires a new audit.
            </p>
          )}

          <div className="mt-3 space-y-2">
            <AuditRow
              label="Orphaned uploads"
              count={latestCompleted.orphanedCount}
              bytes={latestCompleted.orphanedBytes}
            />
            <AuditRow
              label="Unreferenced files / closed log archives"
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
            <AuditRow
              label={latestCompleted.mode === 'logs' ? 'Old log/history records' : 'Old message groups'}
              count={latestCompleted.messageCount}
              bytes={latestCompleted.messageBytes}
            />
            <div className="border-t border-white/10 pt-2">
              <div className="flex items-baseline justify-between">
                <span className="font-semibold text-white">Estimated file bytes reclaimable</span>
                <span className="text-lg font-bold text-emerald-400">
                  {fmtBytes(Number(latestCompleted.totalFreeable))}
                </span>
              </div>
            </div>
          </div>

          <Button className="mt-3" variant="secondary" onClick={() => void loadPreview(latestCompleted.id)}>
            Preview Planned Items
          </Button>
          {preview?.auditId === latestCompleted.id && (
            <div className="mt-2 max-h-64 overflow-y-auto rounded bg-surface-darkest p-3 text-xs text-gray-300">
              {preview.items.map((item) => (
                <p key={item.id} className="mb-2">
                  {item.kind}: {item.snapshot.label}
                  {item.snapshot.createdAt ? ` (${fmtDate(item.snapshot.createdAt)})` : ''} —{' '}
                  {item.files.map((file) => `${file.path} (${fmtBytes(file.size)})`).join(', ') ||
                    'database records only'}
                </p>
              ))}
              {preview.next !== null && (
                <Button size="xs" onClick={() => void loadPreview(latestCompleted.id, preview.next!)}>
                  Load More
                </Button>
              )}
            </div>
          )}

          <div className="mt-4">
            {confirmCleanupId === latestCompleted.id ? (
              <div className="flex items-center gap-3 rounded-md bg-red-900/20 p-3 ring-1 ring-red-500/30">
                <span className="text-sm text-red-300">
                  Permanently delete the reviewed files and any listed messages, replies, polls, reactions, bookmarks or
                  logs. Recent or changed candidates will be skipped. Continue?
                </span>
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  disabled={!!cleaningId || running}
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
                      {audit.status === 'executing' && (
                        <p className="mt-1 text-xs text-gray-400">
                          {audit.processedItems ?? 0} items completed. Work continues if you close this page.
                        </p>
                      )}
                      {audit.stopReason && (
                        <p className="mt-1 text-xs text-gray-400">{audit.stopReason.replaceAll('_', ' ')}</p>
                      )}
                      {audit.error && <p className="mt-1 text-xs text-red-300">{audit.error}</p>}
                      {audit.afterSizeBytes && (
                        <p className="mt-1 text-xs text-gray-400">After: {fmtBytes(Number(audit.afterSizeBytes))}</p>
                      )}
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
                        disabled={!!cleaningId || running || audit.status === 'executing' || audit.canDismiss === false}
                        onClick={() => void handleDeleteAudit(audit.id)}
                      >
                        Dismiss
                      </Button>
                      {audit.planVersion === 1 &&
                        audit.canResume !== false &&
                        ['failed', 'interrupted', 'executing'].includes(audit.status) && (
                          <Button
                            type="button"
                            variant="secondary"
                            size="xs"
                            disabled={!!cleaningId}
                            onClick={() => void handleCleanup(audit.id)}
                          >
                            Resume / Recover
                          </Button>
                        )}
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
