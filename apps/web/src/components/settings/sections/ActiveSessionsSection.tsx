import { useEffect, useState } from 'react'
import { api, type ActiveSession } from '@/lib/api'
import { useAuthStore } from '@/stores/auth.store'

function parseUA(ua: string | null): string {
  if (!ua) return 'Unknown device'
  const browser =
    ua.match(/Edg\/([\d.]+)/)?.[0]?.replace('Edg', 'Edge') ??
    ua.match(/Chrome\/([\d.]+)/)?.[0] ??
    ua.match(/Firefox\/([\d.]+)/)?.[0] ??
    ua.match(/Safari\/([\d.]+)/)?.[0] ??
    'Browser'
  const os =
    ua.match(/Windows NT [\d.]+/)?.[0]?.replace('Windows NT 10.0', 'Windows') ??
    ua.match(/Mac OS X [\d._]+/)?.[0]?.replace(/_/g, '.') ??
    ua.match(/Linux/)?.[0] ??
    ua.match(/Android [\d.]+/)?.[0] ??
    ua.match(/iPhone OS [\d_]+/)?.[0]?.replace(/_/g, '.') ??
    ''
  return `${browser} on ${os || 'Unknown OS'}`
}

function formatSessionDate(iso: string | null): string {
  if (!iso) return 'Never'
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

export function ActiveSessionsSection() {
  const [sessions, setSessions] = useState<ActiveSession[]>([])
  const [loading, setLoading] = useState(true)
  const [revoking, setRevoking] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    api
      .getSessions()
      .then((data) => {
        if (!cancelled) setSessions(data)
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load sessions')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const handleRevoke = async (id: string) => {
    setRevoking(id)
    try {
      await api.revokeSession(id)
      setSessions((prev) => prev.filter((s) => s.id !== id))
    } catch {
      setError('Failed to revoke session')
    } finally {
      setRevoking(null)
    }
  }

  const handleRevokeAll = async () => {
    setRevoking('all')
    try {
      const rt = useAuthStore.getState().refreshToken
      await api.revokeAllSessions(rt ?? '')
      setSessions((prev) => prev.slice(0, 1))
    } catch {
      setError('Failed to revoke sessions')
    } finally {
      setRevoking(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-600 border-t-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-400">
        Devices where your account is currently logged in. Revoke sessions you don't recognize.
      </p>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {sessions.length > 1 && (
        <button
          type="button"
          onClick={() => void handleRevokeAll()}
          disabled={revoking !== null}
          className="rounded-md bg-red-500/10 px-4 py-2 text-sm font-medium text-red-400 transition hover:bg-red-500/20 disabled:opacity-50"
        >
          {revoking === 'all' ? 'Revoking...' : 'Revoke All Other Sessions'}
        </button>
      )}

      <div className="space-y-2">
        {sessions.map((s, i) => (
          <div key={s.id} className="flex items-center gap-3 rounded-lg bg-surface-dark px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-white">
                {parseUA(s.userAgent)}
                {i === 0 && (
                  <span className="ml-2 rounded bg-primary/20 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                    Current
                  </span>
                )}
              </p>
              <p className="text-xs text-gray-400">
                {s.ipAddress ?? 'Unknown IP'} · Last used {formatSessionDate(s.lastUsedAt)}
              </p>
            </div>
            {i !== 0 && (
              <button
                type="button"
                onClick={() => void handleRevoke(s.id)}
                disabled={revoking !== null}
                className="shrink-0 rounded-md px-3 py-1.5 text-xs font-medium text-red-400 transition hover:bg-red-500/10 disabled:opacity-50"
              >
                {revoking === s.id ? '...' : 'Revoke'}
              </button>
            )}
          </div>
        ))}

        {sessions.length === 0 && <p className="py-4 text-center text-sm text-gray-500">No active sessions found.</p>}
      </div>
    </div>
  )
}
