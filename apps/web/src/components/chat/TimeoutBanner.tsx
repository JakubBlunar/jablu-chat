import { useEffect, useMemo, useState } from 'react'
import { useMemberStore } from '@/stores/member.store'

function formatRemaining(ms: number): string {
  if (ms <= 0) return '0s'
  const totalSeconds = Math.ceil(ms / 1000)
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  const parts: string[] = []
  if (days > 0) parts.push(`${days}d`)
  if (hours > 0) parts.push(`${hours}h`)
  if (minutes > 0 && days === 0) parts.push(`${minutes}m`)
  if (days === 0 && hours === 0) parts.push(`${seconds}s`)
  return parts.join(' ')
}

export interface TimeoutBannerProps {
  mutedUntil: string
  reason?: string | null
  mutedById?: string | null
}

export function TimeoutBanner({ mutedUntil, reason, mutedById }: TimeoutBannerProps) {
  const until = useMemo(() => new Date(mutedUntil).getTime(), [mutedUntil])
  const [remaining, setRemaining] = useState(() => Math.max(0, until - Date.now()))

  useEffect(() => {
    setRemaining(Math.max(0, until - Date.now()))
    if (until <= Date.now()) return
    const id = window.setInterval(() => {
      const next = Math.max(0, until - Date.now())
      setRemaining(next)
      if (next <= 0) window.clearInterval(id)
    }, 1000)
    return () => window.clearInterval(id)
  }, [until])

  const mutedBy = useMemberStore((s) =>
    mutedById ? s.members.find((m) => m.userId === mutedById)?.user : undefined
  )
  const mutedByName = mutedBy?.displayName ?? mutedBy?.username ?? null

  return (
    <div className="shrink-0 border-t border-black/20 bg-surface px-4 py-3">
      <div className="flex items-start gap-2 rounded-lg bg-yellow-500/10 px-4 py-2.5 text-sm text-yellow-400">
        <svg className="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <div className="flex-1 space-y-0.5">
          <div>
            You are timed out in this server. Time remaining:{' '}
            <span className="font-medium">{formatRemaining(remaining)}</span>
            {mutedByName ? <> · by <span className="font-medium">{mutedByName}</span></> : null}
          </div>
          {reason ? (
            <div className="text-xs text-yellow-400/80">Reason: {reason}</div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
