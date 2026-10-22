import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Input, InlineAlert } from '@/components/ui'
import { ListPagination, useListPage } from '../ListControls'
import { UserAvatar } from '@/components/UserAvatar'
import { api } from '@/lib/api'
import type { Server } from '@/stores/server.store'

type Ban = Awaited<ReturnType<typeof api.getBans>>[number]

export function BansTab({ server }: { server: Server }) {
  const { t } = useTranslation('server-settings')
  const [bans, setBans] = useState<Ban[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [unbanningId, setUnbanningId] = useState<string | null>(null)
  const query = search.trim().toLocaleLowerCase()
  const filtered = bans.filter((ban) =>
    [ban.user.username, ban.user.displayName, ban.reason, ban.bannedBy.username, ban.bannedBy.displayName].some(
      (value) => value?.toLocaleLowerCase().includes(query)
    )
  )
  const pagination = useListPage(filtered, search)

  const fetchBans = useCallback(async () => {
    setLoading(true)
    setError(null)
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
      setUnbanningId(ban.id)
      setError(null)
      try {
        await api.unbanMember(server.id, ban.userId)
        setBans((prev) => prev.filter((b) => b.id !== ban.id))
      } catch {
        setError(t('bans.unbanFailed'))
      } finally {
        setUnbanningId(null)
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
    <div className="space-y-4">
      <h2 className="mb-1 text-base font-semibold text-white">{t('bans.title')}</h2>
      {!error && (
        <p className="mb-4 text-sm text-gray-400">
          {bans.length === 0 ? t('bans.none') : t('bans.count', { count: bans.length })}
        </p>
      )}

      {error && (
        <InlineAlert variant="error">
          {error}
          <Button size="sm" variant="secondary" onClick={() => void fetchBans()}>
            {t('lists.retry')}
          </Button>
        </InlineAlert>
      )}
      <Input
        size="sm"
        aria-label={t('bans.search')}
        placeholder={t('bans.search')}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className="space-y-1">
        {pagination.items.map((ban) => (
          <div key={ban.id} className="flex items-center gap-3 rounded-lg border border-white/5 bg-white/[0.02] p-3">
            <UserAvatar username={ban.user.username} avatarUrl={ban.user.avatarUrl} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">{ban.user.displayName ?? ban.user.username}</p>
              <p className="break-words text-xs text-gray-400" title={ban.reason ?? undefined}>
                {ban.reason ? t('bans.reason', { reason: ban.reason }) : t('bans.noReason')}
              </p>
              <p className="mt-0.5 truncate text-xs text-gray-500">
                {t('bans.bannedBy', { name: ban.bannedBy.displayName ?? ban.bannedBy.username })}
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => void handleUnban(ban)}
              loading={unbanningId === ban.id}
              disabled={unbanningId !== null}
              className="shrink-0 hover:bg-red-500/10 hover:text-red-400"
            >
              {t('bans.unban')}
            </Button>
          </div>
        ))}
      </div>
      {filtered.length === 0 && bans.length > 0 && (
        <p className="py-10 text-center text-sm text-gray-400">{t('lists.noResults')}</p>
      )}
      <ListPagination {...pagination} />
    </div>
  )
}
