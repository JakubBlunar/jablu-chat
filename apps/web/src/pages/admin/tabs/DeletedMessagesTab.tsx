import { useCallback, useEffect, useState } from 'react'
import type { DeletedStats, PurgeResult } from '../adminTypes'
import { adminFetch } from '../adminApi'
import { fmtBytes } from '../adminFormatters'

export function DeletedMessagesTab() {
  const [stats, setStats] = useState<DeletedStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [purging, setPurging] = useState(false)
  const [confirmPurge, setConfirmPurge] = useState(false)
  const [purgeResult, setPurgeResult] = useState<PurgeResult | null>(null)

  const fetchStats = useCallback(async () => {
    try {
      const s = await adminFetch<DeletedStats>('/api/admin/messages/deleted-stats')
      setStats(s)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load stats')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchStats()
  }, [fetchStats])

  const handlePurge = async () => {
    setPurging(true)
    setError('')
    setPurgeResult(null)
    try {
      const result = await adminFetch<PurgeResult>('/api/admin/messages/purge-deleted', { method: 'POST' })
      setPurgeResult(result)
      await fetchStats()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Purge failed')
    } finally {
      setPurging(false)
      setConfirmPurge(false)
    }
  }

  if (loading) {
    return <div className="py-12 text-center text-gray-400">Loading deleted message stats…</div>
  }

  return (
    <>
      {error && (
        <div className="mb-4 rounded-md bg-red-900/30 px-4 py-3 text-sm text-red-300 ring-1 ring-red-500/30">
          {error}
        </div>
      )}

      {purgeResult && (
        <div className="mb-4 rounded-md bg-emerald-900/30 px-4 py-3 text-sm text-emerald-300 ring-1 ring-emerald-500/30">
          Purged {purgeResult.purgedMessages} messages and {purgeResult.purgedAttachments} attachments, freed{' '}
          {fmtBytes(purgeResult.freedBytes)}.
        </div>
      )}

      <div className="rounded-lg bg-surface-dark p-5 ring-1 ring-white/10">
        <h2 className="text-lg font-semibold">Deleted Messages</h2>
        <p className="mt-1 text-sm text-gray-400">
          Soft-deleted messages still occupy disk space through their attachments. Purging permanently removes them.
        </p>

        {stats && (
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-md bg-surface-darkest p-4 ring-1 ring-white/5">
              <div className="text-2xl font-bold">{stats.messageCount.toLocaleString()}</div>
              <div className="mt-1 text-xs text-gray-400">Deleted messages</div>
            </div>
            <div className="rounded-md bg-surface-darkest p-4 ring-1 ring-white/5">
              <div className="text-2xl font-bold">{stats.attachmentCount.toLocaleString()}</div>
              <div className="mt-1 text-xs text-gray-400">Orphaned attachments</div>
            </div>
            <div className="rounded-md bg-surface-darkest p-4 ring-1 ring-white/5">
              <div className="text-2xl font-bold">{fmtBytes(stats.totalSizeBytes)}</div>
              <div className="mt-1 text-xs text-gray-400">Disk space used</div>
            </div>
          </div>
        )}

        <div className="mt-5">
          {!confirmPurge ? (
            <button
              type="button"
              onClick={() => setConfirmPurge(true)}
              disabled={!stats || stats.messageCount === 0}
              className="rounded-md bg-red-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-red-500 disabled:opacity-40 disabled:hover:bg-red-600"
            >
              Purge All Deleted Messages
            </button>
          ) : (
            <div className="rounded-md bg-red-900/20 p-4 ring-1 ring-red-500/30">
              <p className="text-sm text-red-200">
                This will permanently delete{' '}
                <span className="font-semibold">{stats?.messageCount.toLocaleString()}</span> messages and{' '}
                <span className="font-semibold">{stats?.attachmentCount.toLocaleString()}</span> attachments, freeing{' '}
                <span className="font-semibold">{stats ? fmtBytes(stats.totalSizeBytes) : '0 B'}</span>. This cannot be
                undone.
              </p>
              <div className="mt-3 flex gap-3">
                <button
                  type="button"
                  onClick={() => void handlePurge()}
                  disabled={purging}
                  className="rounded-md bg-red-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-red-500 disabled:opacity-50"
                >
                  {purging ? 'Purging…' : 'Confirm Purge'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmPurge(false)}
                  disabled={purging}
                  className="rounded-md px-4 py-2 text-sm font-medium text-gray-400 transition hover:text-white"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
