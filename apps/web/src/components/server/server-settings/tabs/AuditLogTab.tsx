import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
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

  const fetchLog = useCallback(
    async (cursor?: string) => {
      setLoading(true)
      setLogError(null)
      try {
        const data = await api.getAuditLog(server.id, 50, cursor)
        if (cursor) {
          setEntries((prev) => [...prev, ...data.entries])
        } else {
          setEntries(data.entries)
        }
        setHasMore(data.hasMore)
      } catch {
        setLogError(t('audit.loadFailed'))
      } finally {
        setLoading(false)
      }
    },
    [server.id, t]
  )

  useEffect(() => {
    void fetchLog()
  }, [fetchLog])

  const loadMore = useCallback(() => {
    const last = entries[entries.length - 1]
    if (last) void fetchLog(last.createdAt)
  }, [entries, fetchLog])

  return (
    <div className="space-y-3">
      {logError && <InlineAlert variant="error">{logError}</InlineAlert>}
      {entries.length === 0 && !loading ? (
        <p className="text-center text-sm text-gray-500">{t('audit.empty')}</p>
      ) : (
        <div className="space-y-1">
          {entries.map((e) => (
            <div key={e.id} className="flex items-start gap-3 rounded-md px-3 py-2 hover:bg-white/[0.04]">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-white">
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
                      {' '}&middot; {t(`audit.targets.${e.targetType}`, { defaultValue: e.targetType })}
                    </span>
                  )}
                </p>
                {e.details && <p className="mt-0.5 text-xs text-gray-500">{e.details}</p>}
              </div>
              <time className="shrink-0 text-xs text-gray-500">{formatFullDateTime(e.createdAt)}</time>
            </div>
          ))}
        </div>
      )}
      {loading && <p className="text-center text-sm text-gray-400">{t('audit.loading')}</p>}
      {hasMore && !loading && (
        <div className="flex justify-center">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={loadMore}
            className="bg-surface-dark ring-1 ring-white/10 hover:bg-surface-selected"
          >
            {t('audit.loadMore')}
          </Button>
        </div>
      )}
    </div>
  )
}
