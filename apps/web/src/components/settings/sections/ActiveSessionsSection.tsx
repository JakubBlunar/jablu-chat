import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { api, type ActiveSession } from '@/lib/api'
import { useAuthStore } from '@/stores/auth.store'

function parseUA(ua: string | null, t: TFunction<'settings'>): string {
  if (!ua) return t('sessions.unknownDevice')
  const browser =
    ua.match(/Edg\/([\d.]+)/)?.[0]?.replace('Edg', 'Edge') ??
    ua.match(/Chrome\/([\d.]+)/)?.[0] ??
    ua.match(/Firefox\/([\d.]+)/)?.[0] ??
    ua.match(/Safari\/([\d.]+)/)?.[0] ??
    t('sessions.unknownBrowser')
  const os =
    ua.match(/Windows NT [\d.]+/)?.[0]?.replace('Windows NT 10.0', 'Windows') ??
    ua.match(/Mac OS X [\d._]+/)?.[0]?.replace(/_/g, '.') ??
    ua.match(/Linux/)?.[0] ??
    ua.match(/Android [\d.]+/)?.[0] ??
    ua.match(/iPhone OS [\d_]+/)?.[0]?.replace(/_/g, '.') ??
    ''
  return t('sessions.browserOnOS', { browser, os: os || t('sessions.unknownOS') })
}

function formatSessionDate(iso: string | null, locale: string | undefined, t: TFunction<'settings'>): string {
  if (!iso) return t('sessions.never')
  return new Date(iso).toLocaleString(locale, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

export function ActiveSessionsSection() {
  const { t, i18n } = useTranslation('settings')
  const [sessions, setSessions] = useState<ActiveSession[]>([])
  const [loading, setLoading] = useState(true)
  const [revoking, setRevoking] = useState<string | null>(null)
  const [error, setError] = useState('')
  const locale = i18n.resolvedLanguage ?? i18n.language

  useEffect(() => {
    let cancelled = false
    api
      .getSessions()
      .then((data) => {
        if (!cancelled) setSessions(data)
      })
      .catch(() => {
        if (!cancelled) setError(t('sessions.loadFailed'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [t])

  const handleRevoke = async (id: string) => {
    setRevoking(id)
    try {
      await api.revokeSession(id)
      setSessions((prev) => prev.filter((s) => s.id !== id))
    } catch {
      setError(t('sessions.revokeFailed'))
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
      setError(t('sessions.revokeAllFailed'))
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
      <p className="text-sm text-gray-400">{t('sessions.description')}</p>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {sessions.length > 1 && (
        <button
          type="button"
          onClick={() => void handleRevokeAll()}
          disabled={revoking !== null}
          className="rounded-md bg-red-500/10 px-4 py-2 text-sm font-medium text-red-400 transition hover:bg-red-500/20 disabled:opacity-50"
        >
          {revoking === 'all' ? t('sessions.revoking') : t('sessions.revokeAll')}
        </button>
      )}

      <div className="space-y-2">
        {sessions.map((s, i) => (
          <div key={s.id} className="flex items-center gap-3 rounded-lg bg-surface-dark px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-white">
                {parseUA(s.userAgent, t)}
                {i === 0 && (
                  <span className="ml-2 rounded bg-primary/20 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                    {t('sessions.current')}
                  </span>
                )}
              </p>
              <p className="text-xs text-gray-400">
                {s.ipAddress ?? t('sessions.unknownIP')} ·{' '}
                {t('sessions.lastUsed', { date: formatSessionDate(s.lastUsedAt, locale, t) })}
              </p>
            </div>
            {i !== 0 && (
              <button
                type="button"
                onClick={() => void handleRevoke(s.id)}
                disabled={revoking !== null}
                className="shrink-0 rounded-md px-3 py-1.5 text-xs font-medium text-red-400 transition hover:bg-red-500/10 disabled:opacity-50"
              >
                {revoking === s.id ? '…' : t('sessions.revoke')}
              </button>
            )}
          </div>
        ))}

        {sessions.length === 0 && <p className="py-4 text-center text-sm text-gray-500">{t('sessions.empty')}</p>}
      </div>
    </div>
  )
}
