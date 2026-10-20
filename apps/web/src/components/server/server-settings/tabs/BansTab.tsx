import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui'
import { UserAvatar } from '@/components/UserAvatar'
import { api } from '@/lib/api'
import type { Server } from '@/stores/server.store'

type Ban = Awaited<ReturnType<typeof api.getBans>>[number]

export function BansTab({ server }: { server: Server }) {
  const { t } = useTranslation('server-settings')
  const [bans, setBans] = useState<Ban[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchBans = useCallback(async () => {
    try {
      const result = await api.getBans(server.id)
      setBans(result)
    } catch {
      setError(t('bans.loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [server.id, t])

  useEffect(() => {
    void fetchBans()
  }, [fetchBans])

  const handleUnban = useCallback(
    async (ban: Ban) => {
      if (!confirm(t('bans.unbanConfirm', { name: ban.user.displayName ?? ban.user.username }))) return
      try {
        await api.unbanMember(server.id, ban.userId)
        setBans((prev) => prev.filter((b) => b.id !== ban.id))
      } catch {
        setError(t('bans.unbanFailed'))
      }
    },
    [server.id, t]
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-600 border-t-primary" />
      </div>
    )
  }

  return (
    <div>
      <h2 className="mb-1 text-base font-semibold text-white">{t('bans.title')}</h2>
      <p className="mb-4 text-sm text-gray-400">
        {bans.length === 0 ? t('bans.none') : t('bans.count', { count: bans.length })}
      </p>

      {error && (
        <p className="mb-3 text-sm text-red-400" role="alert">{error}</p>
      )}

      <div className="space-y-1">
        {bans.map((ban) => (
          <div key={ban.id} className="flex items-center gap-3 rounded-lg bg-surface-darkest px-3 py-2.5">
            <UserAvatar
              username={ban.user.username}
              avatarUrl={ban.user.avatarUrl}
              size="sm"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">
                {ban.user.displayName ?? ban.user.username}
              </p>
              <p className="truncate text-xs text-gray-500">
                {ban.reason ? t('bans.reason', { reason: ban.reason }) : t('bans.noReason')}
                {' \u00b7 '}
                {t('bans.bannedBy', { name: ban.bannedBy.displayName ?? ban.bannedBy.username })}
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => void handleUnban(ban)}
              className="shrink-0 hover:bg-red-500/10 hover:text-red-400"
            >
              {t('bans.unban')}
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
}
