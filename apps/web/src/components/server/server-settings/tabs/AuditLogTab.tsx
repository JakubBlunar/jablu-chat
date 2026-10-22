import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Input, Select, Spinner } from '@/components/ui'
import { InlineAlert } from '@/components/ui/InlineAlert'
import { api, type AuditLogEntry } from '@/lib/api'
import { formatFullDateTime } from '@/lib/format-time'
import type { Server } from '@/stores/server.store'

const AUDIT_ACTION_KEYS: Record<string, string> = {
  'server.update': 'serverUpdate',
  'server.icon.update': 'serverIconUpdate',
  'member.profile.update': 'memberProfileUpdate',
  'member.role.update': 'memberRoleUpdate',
  'member.kick': 'memberKick',
  'member.ban': 'memberBan',
  'member.timeout': 'memberTimeout',
  'member.timeout.remove': 'memberTimeoutRemove',
  'member.unban': 'memberUnban',
  'emoji.create': 'emojiCreate',
  'emoji.update': 'emojiUpdate',
  'emoji.delete': 'emojiDelete',
  'channel.create': 'channelCreate',
  'channel.update': 'channelUpdate',
  'channel.delete': 'channelDelete',
  'channel.reorder': 'channelReorder',
  'category.create': 'categoryCreate',
  'category.update': 'categoryUpdate',
  'category.delete': 'categoryDelete',
  'category.reorder': 'categoryReorder',
  'invite.create': 'inviteCreate',
  'invite.delete': 'inviteDelete',
  'webhook.create': 'webhookCreate',
  'webhook.delete': 'webhookDelete',
  KICK_MEMBER: 'memberKick',
  UPDATE_SERVER: 'serverUpdate'
}

export function AuditLogTab({ server }: { server: Server }) {
  const { t } = useTranslation('server-settings')
  const [entries, setEntries] = useState<AuditLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(false)
  const [logError, setLogError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [action, setAction] = useState('')
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined])
  const [page, setPage] = useState(0)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  const cursor = cursors[page]

  useEffect(() => {
    let active = true
    setLoading(true)
    setLogError(null)
    const timer = window.setTimeout(() => {
      api
        .getAuditLog(server.id, 25, cursor, { search, action })
        .then((data) => {
          if (!active) return
          setEntries(data.entries)
          setHasMore(data.hasMore)
          setNextCursor(data.nextCursor ?? null)
        })
        .catch(() => {
          if (active) setLogError(t('audit.loadFailed'))
        })
        .finally(() => {
          if (active) setLoading(false)
        })
    }, 250)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [server.id, t, cursor, search, action, retry])

  const resetPage = () => {
    setCursors([undefined])
    setPage(0)
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_180px]">
        <Input
          size="sm"
          aria-label={t('audit.search')}
          placeholder={t('audit.search')}
          value={search}
          maxLength={200}
          onChange={(e) => {
            setSearch(e.target.value)
            resetPage()
          }}
        />
        <Select
          size="sm"
          aria-label={t('audit.actionFilter')}
          value={action}
          onChange={(e) => {
            setAction(e.target.value)
            resetPage()
          }}
        >
          <option value="">{t('audit.allActions')}</option>
          {Object.entries(AUDIT_ACTION_KEYS).map(([value, key]) => (
            <option key={value} value={value}>
              {t(`audit.actions.${key}`)}
            </option>
          ))}
        </Select>
      </div>
      {logError && (
        <InlineAlert variant="error">
          {logError}
          <Button size="sm" variant="secondary" onClick={() => setRetry((value) => value + 1)}>
            {t('lists.retry')}
          </Button>
        </InlineAlert>
      )}
      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner size="md" />
        </div>
      ) : logError ? null : entries.length === 0 ? (
        <p className="py-10 text-center text-sm text-gray-400">
          {t(search || action ? 'lists.noResults' : 'audit.empty')}
        </p>
      ) : (
        <div className="space-y-1">
          {entries.map((e) => (
            <div key={e.id} className="flex flex-col gap-1 rounded-lg border border-white/5 bg-white/[0.02] p-3">
              <div className="min-w-0 flex-1">
                <p className="break-words text-sm text-white">
                  <span className="font-semibold text-primary">
                    {e.actor?.displayName ?? e.actor?.username ?? t('audit.unknownActor')}
                  </span>{' '}
                  <span className="font-medium">
                    {AUDIT_ACTION_KEYS[e.action]
                      ? t(`audit.actions.${AUDIT_ACTION_KEYS[e.action]}`, { defaultValue: e.action })
                      : e.action}
                  </span>
                  {e.targetType && (
                    <span className="text-gray-400">
                      {' '}
                      &middot; {t(`audit.targets.${e.targetType}`, { defaultValue: e.targetType })}
                    </span>
                  )}
                </p>
                {e.details && (
                  <p className="mt-0.5 whitespace-pre-wrap break-words text-xs text-gray-400">{e.details}</p>
                )}
              </div>
              <time dateTime={e.createdAt} className="shrink-0 text-xs text-gray-500">
                {formatFullDateTime(e.createdAt)}
              </time>
            </div>
          ))}
        </div>
      )}
      <nav
        aria-label={t('lists.pagination')}
        className="flex items-center justify-between gap-3 border-t border-white/10 pt-3"
      >
        <span role="status" className="text-xs text-gray-400">
          {t('audit.page', { page: page + 1 })}
        </span>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" disabled={loading || page === 0} onClick={() => setPage(page - 1)}>
            {t('lists.previous')}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={loading || !!logError || !hasMore || !nextCursor}
            onClick={() => {
              setCursors([...cursors.slice(0, page + 1), nextCursor!])
              setPage(page + 1)
            }}
          >
            {t('lists.next')}
          </Button>
        </div>
      </nav>
    </div>
  )
}
