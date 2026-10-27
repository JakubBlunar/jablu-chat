import { useEffect, useState } from 'react'
import type { DeletedStats } from '../adminTypes'
import { adminFetch } from '../adminApi'
import { fmtBytes } from '../adminFormatters'
import { Button } from '@/components/ui'

export function DeletedMessagesTab({ onReview }: { onReview: () => void }) {
  const [stats, setStats] = useState<DeletedStats | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let cancelled = false
    void adminFetch<DeletedStats>('/api/admin/messages/deleted-stats')
      .then((value) => {
        if (!cancelled) setStats(value)
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load')
      })
    return () => {
      cancelled = true
    }
  }, [])
  return (
    <div className="rounded-lg bg-surface-dark p-5 ring-1 ring-white/10">
      <h2 className="text-lg font-semibold">Deleted Messages</h2>
      {error && <p className="mt-2 text-sm text-red-300">{error}</p>}
      <p className="mt-2 text-sm text-gray-400">
        Removed messages may still own files. Prepare a deleted-message audit in Storage to review exact candidates
        before permanent deletion. Pinned messages, protected archived channels and roots with live replies are
        preserved.
      </p>
      {stats && (
        <p className="mt-3 text-sm text-gray-300">
          {stats.messageCount.toLocaleString()} removed messages; {stats.attachmentCount.toLocaleString()} attachments
          with {fmtBytes(stats.totalSizeBytes)} of recorded original upload sizes. The audit measures actual remaining
          files and thumbnails.
        </p>
      )}
      <Button className="mt-4" onClick={onReview}>
        Open Storage Cleanup
      </Button>
    </div>
  )
}
