import { useEffect, useState } from 'react'
import { ModalOverlay } from '@/components/ui/ModalOverlay'
import { UserAvatar } from '@/components/UserAvatar'
import { Spinner } from '@/components/ui'
import { api } from '@/lib/api'

type LeaderboardRow = Awaited<ReturnType<typeof api.getXpLeaderboard>>[number]
type Progress = Awaited<ReturnType<typeof api.getMyXpProgress>>

export function LeaderboardModal({ serverId, onClose }: { serverId: string; onClose: () => void }) {
  const [rows, setRows] = useState<LeaderboardRow[] | null>(null)
  const [me, setMe] = useState<Progress | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setError(null)
    Promise.all([
      api.getXpLeaderboard(serverId),
      api.getMyXpProgress(serverId).catch(() => null)
    ])
      .then(([list, progress]) => {
        if (cancelled) return
        setRows(list)
        setMe(progress)
      })
      .catch((e) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'Failed to load leaderboard')
        setRows([])
      })
    return () => {
      cancelled = true
    }
  }, [serverId])

  return (
    <ModalOverlay onClose={onClose} maxWidth="max-w-[520px]">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Leaderboard</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-gray-400 transition hover:text-white"
          aria-label="Close"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {me && <MyProgressCard progress={me} />}

      {error && (
        <div className="mt-4 rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</div>
      )}

      <div className="mt-4 max-h-[50vh] space-y-1 overflow-y-auto pr-1">
        {rows === null ? (
          <div className="flex items-center justify-center py-8">
            <Spinner />
          </div>
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">
            No one has earned XP in this server yet. Send a message to get things started!
          </p>
        ) : (
          rows.map((r) => (
            <div
              key={r.userId}
              className="flex items-center gap-3 rounded-md px-2 py-2 transition hover:bg-white/[0.04]"
            >
              <span className={`w-6 shrink-0 text-sm font-semibold ${rankColor(r.rank)}`}>
                #{r.rank}
              </span>
              <UserAvatar
                username={r.user.username}
                avatarUrl={r.user.avatarUrl}
                size="sm"
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-white">
                  {r.user.displayName ?? r.user.username}
                </div>
                <div className="text-xs text-gray-400">Level {r.level}</div>
              </div>
              <div className="shrink-0 text-xs text-gray-400 tabular-nums">
                {r.xp.toLocaleString()} XP
              </div>
            </div>
          ))
        )}
      </div>
    </ModalOverlay>
  )
}

function rankColor(rank: number): string {
  if (rank === 1) return 'text-yellow-400'
  if (rank === 2) return 'text-gray-300'
  if (rank === 3) return 'text-amber-600'
  return 'text-gray-500'
}

function MyProgressCard({ progress }: { progress: Progress }) {
  const pct =
    progress.xpNeededForLevel > 0
      ? Math.min(100, Math.round((progress.xpIntoLevel / progress.xpNeededForLevel) * 100))
      : 0
  return (
    <div className="mt-4 rounded-md border border-white/10 bg-surface-darkest p-3">
      <div className="flex items-baseline justify-between">
        <div>
          <span className="text-xs uppercase tracking-wide text-gray-400">Your level</span>
          <div className="text-2xl font-semibold text-white">Level {progress.level}</div>
        </div>
        <div className="text-right text-xs text-gray-400 tabular-nums">
          <div>{progress.xpIntoLevel.toLocaleString()} / {progress.xpNeededForLevel.toLocaleString()} XP</div>
          <div className="mt-0.5">{progress.xp.toLocaleString()} total</div>
        </div>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/5">
        <div
          className="h-full bg-primary transition-all"
          style={{ width: `${pct}%` }}
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          role="progressbar"
        />
      </div>
    </div>
  )
}
