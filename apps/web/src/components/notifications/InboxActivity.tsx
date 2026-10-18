import { useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import SimpleBar from 'simplebar-react'
import type { InAppNotificationDto } from '@/lib/api/types'
import { useAppNavigate } from '@/hooks/useAppNavigate'
import { useDelayedFlag } from '@/hooks/useDelayedFlag'
import { useNotificationCenterStore } from '@/stores/notificationCenter.store'
import { getDmCallUrl, messageNotificationUrl } from '@chat/shared'
import type { TFunction } from 'i18next'

function titleFor(n: InAppNotificationDto, t: TFunction<'nav'>, language: string): string {
  const p = n.payload
  const author = typeof p.authorName === 'string' ? p.authorName : t('notificationSomeone')
  const channel = typeof p.channelName === 'string' ? p.channelName : t('notificationChannel')
  const server = typeof p.serverName === 'string' ? p.serverName : t('notificationServer')
  const count = typeof p.count === 'number' && p.count > 0 ? p.count : 1
  switch (n.kind) {
    case 'mention':
      return t('notificationMention', { author, channel })
    case 'dm_message':
      return t('notificationDm', { author, count })
    case 'dm_call':
      return t('notificationCall', { author })
    case 'thread_reply':
      return t('notificationThread', { author, channel, count })
    case 'channel_message':
      return t('notificationMessage', { author, channel, count })
    case 'reply':
      return t('notificationReply', { author, channel })
    case 'friend_request': {
      const name = typeof p.requesterName === 'string' ? p.requesterName : t('notificationSomeone')
      return t('notificationFriendRequest', { name })
    }
    case 'friend_accepted': {
      const name = typeof p.userName === 'string' ? p.userName : t('notificationSomeone')
      return t('notificationFriendAccepted', { name })
    }
    case 'moderation': {
      const action = p.action
      if (action === 'ban') return t('notificationBanned', { server })
      if (action === 'kick') return t('notificationKicked', { server })
      return t('notificationTimeout', { server })
    }
    case 'role_changed': {
      const added = Array.isArray(p.added) ? p.added.filter((name): name is string => typeof name === 'string') : []
      const removed = Array.isArray(p.removed)
        ? p.removed.filter((name): name is string => typeof name === 'string')
        : []
      if (added.length > 0 && removed.length === 0) {
        return t('notificationRolesAdded', { roles: new Intl.ListFormat(language).format(added), server })
      }
      if (removed.length > 0 && added.length === 0) {
        return t('notificationRolesRemoved', { roles: new Intl.ListFormat(language).format(removed), server })
      }
      return t('notificationRolesChanged', { server })
    }
    case 'level_up': {
      const level = typeof p.level === 'number' ? p.level : null
      return level === null ? t('notificationLevelUp', { server }) : t('notificationLevel', { server, level })
    }
    case 'server_event': {
      const name = typeof p.eventName === 'string' ? p.eventName : t('notificationEvent')
      return t(p.state === 'soon' ? 'notificationEventSoon' : 'notificationEventNow', { name })
    }
    case 'announcement': {
      const title = typeof p.title === 'string' ? p.title : null
      return title ?? t('notificationAnnouncement')
    }
    default:
      return t('notificationGeneric')
  }
}

function snippetFor(n: InAppNotificationDto): string {
  const p = n.payload
  // Message-shaped kinds carry a `snippet`; the rest carry their detail under
  // whatever field made sense for them.
  if (typeof p.snippet === 'string') return p.snippet
  if (n.kind === 'announcement' && typeof p.body === 'string') return p.body
  if (n.kind === 'moderation' && typeof p.reason === 'string') return p.reason
  return ''
}

/** Distinguishes kinds at a glance so the inbox isn't a wall of identical rows. */
function iconFor(kind: InAppNotificationDto['kind']) {
  const common = {
    className: 'h-4 w-4 shrink-0',
    fill: 'none',
    viewBox: '0 0 24 24',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const
  }
  switch (kind) {
    case 'dm_call':
      return (
        <svg {...common}>
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2A19.79 19.79 0 0 1 3.09 5.18 2 2 0 0 1 5.08 3h3a2 2 0 0 1 2 1.72c.12.96.35 1.91.69 2.81a2 2 0 0 1-.45 2.11L9.05 10.9a16 16 0 0 0 6 6l1.26-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.69A2 2 0 0 1 22 16.92z" />
        </svg>
      )
    case 'mention':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="4" />
          <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94" />
        </svg>
      )
    case 'reply':
    case 'thread_reply':
      return (
        <svg {...common}>
          <path d="M9 17 4 12l5-5" />
          <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
        </svg>
      )
    case 'dm_message':
    case 'channel_message':
      return (
        <svg {...common}>
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      )
    case 'friend_request':
    case 'friend_accepted':
      return (
        <svg {...common}>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="m17 11 2 2 4-4" />
        </svg>
      )
    case 'moderation':
      return (
        <svg {...common}>
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <path d="M12 9v4M12 17h.01" />
        </svg>
      )
    case 'role_changed':
      return (
        <svg {...common}>
          <path d="M12 2 3 7v6c0 5 9 9 9 9s9-4 9-9V7z" />
        </svg>
      )
    case 'level_up':
      return (
        <svg {...common}>
          <path d="m12 3 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5-5.8-3-5.8 3 1.1-6.5L2.6 9.8l6.5-.9z" />
        </svg>
      )
    case 'server_event':
      return (
        <svg {...common}>
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
      )
    case 'announcement':
      return (
        <svg {...common}>
          <path d="m3 11 18-8v18l-18-8z" />
          <path d="M7 12v6a2 2 0 0 0 4 0v-4" />
        </svg>
      )
    default:
      return null
  }
}

export function InboxActivity({ onNavigate }: { onNavigate: () => void }) {
  const unreadCount = useNotificationCenterStore((s) => s.unreadCount)
  const items = useNotificationCenterStore((s) => s.items)
  const listLoading = useNotificationCenterStore((s) => s.listLoading)
  const listError = useNotificationCenterStore((s) => s.listError)
  const unreadError = useNotificationCenterStore((s) => s.unreadError)
  const actionError = useNotificationCenterStore((s) => s.actionError)
  const retryAction = useNotificationCenterStore((s) => s.retryAction)
  const markAllPending = useNotificationCenterStore((s) => s.markAllPending)
  const pendingIds = useNotificationCenterStore((s) => s.pendingIds)
  const nextCursor = useNotificationCenterStore((s) => s.nextCursor)
  const fetchUnread = useNotificationCenterStore((s) => s.fetchUnread)
  const fetchList = useNotificationCenterStore((s) => s.fetchList)
  const markRead = useNotificationCenterStore((s) => s.markRead)
  const markAllRead = useNotificationCenterStore((s) => s.markAllRead)
  const showLoading = useDelayedFlag(listLoading)
  const { navigate } = useAppNavigate()
  const { t, i18n } = useTranslation('nav')
  const { t: tCommon } = useTranslation('common')

  useEffect(() => {
    void fetchUnread()
  }, [fetchUnread])

  const setPanelOpen = useNotificationCenterStore((s) => s.setPanelOpen)

  useEffect(() => {
    setPanelOpen(true)
    return () => setPanelOpen(false)
  }, [setPanelOpen])

  useEffect(() => {
    void fetchList()
  }, [fetchList])

  const onItemClick = useCallback(
    (n: InAppNotificationDto) => {
      const p = n.payload
      try {
        if (n.kind === 'dm_message') {
          const conv = typeof p.conversationId === 'string' ? p.conversationId : null
          const messageId = typeof p.messageId === 'string' ? p.messageId : null
          if (conv) {
            const path = `/channels/@me/${conv}`
            navigate(messageId ? messageNotificationUrl(path, messageId) : path)
          }
        } else if (['mention', 'thread_reply', 'channel_message', 'reply'].includes(n.kind)) {
          const serverId = typeof p.serverId === 'string' ? p.serverId : null
          const channelId = typeof p.channelId === 'string' ? p.channelId : null
          const threadParentId = typeof p.threadParentId === 'string' ? p.threadParentId : null
          const messageId = typeof p.messageId === 'string' ? p.messageId : null
          if (serverId && channelId) {
            const path = `/channels/${serverId}/${channelId}`
            navigate(messageId ? messageNotificationUrl(path, messageId, threadParentId) : path)
          }
        } else if (n.kind === 'dm_call') {
          if (typeof p.conversationId === 'string' && typeof p.callId === 'string') {
            navigate(getDmCallUrl(p.conversationId, p.callId))
          }
        } else if (n.kind === 'friend_request' || n.kind === 'friend_accepted') {
          navigate('/channels/@me')
        } else if (
          n.kind === 'moderation' ||
          n.kind === 'role_changed' ||
          n.kind === 'level_up' ||
          n.kind === 'server_event'
        ) {
          // Server-scoped, but no channel to land on. A kick or ban leaves no
          // server to open either, so fall back to the home view.
          const serverId = typeof p.serverId === 'string' ? p.serverId : null
          const removed = n.kind === 'moderation' && (p.action === 'kick' || p.action === 'ban')
          navigate(serverId && !removed ? `/channels/${serverId}` : '/channels/@me')
        }
        // `announcement` has nowhere to go; clicking it just marks it seen.
      } finally {
        if (!n.readAt && !['mention', 'thread_reply', 'channel_message', 'reply', 'dm_message'].includes(n.kind)) {
          void markRead(n.id)
        }
        onNavigate()
      }
    },
    [markRead, navigate, onNavigate]
  )

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {showLoading && <span className="absolute inset-x-0 top-0 z-10 h-0.5 animate-pulse bg-primary/70" />}
      <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-3 pb-2">
        <span className="text-sm font-semibold text-white">{t('inboxActivity')}</span>
        {unreadCount > 0 && (
          <button
            type="button"
            className="min-h-11 text-xs font-medium text-primary hover:underline"
            onClick={() => void markAllRead()}
            disabled={markAllPending || pendingIds.length > 0}
          >
            {t('inboxMarkAll')}
          </button>
        )}
      </div>
      <SimpleBar className="min-h-0 flex-1">
        {(listError || unreadError || actionError) && (
          <div role="alert" className="border-b border-white/10 px-3 py-3 text-sm text-red-300">
            <p>
              {t(
                actionError ? 'inboxActionFailed' : unreadError && !listError ? 'inboxCountFailed' : 'inboxLoadFailed'
              )}
            </p>
            <button
              type="button"
              className="min-h-11 text-primary disabled:opacity-50"
              disabled={listLoading}
              onClick={() => {
                if (actionError) void retryAction()
                else {
                  void fetchUnread()
                  void fetchList({ append: listError === 'append' })
                }
              }}
            >
              {tCommon('retry')}
            </button>
          </div>
        )}
        {items.length === 0 && showLoading ? (
          <ul aria-hidden>
            {Array.from({ length: 6 }).map((_, i) => (
              <li key={i} className="flex flex-col gap-1.5 px-3 py-3">
                <div className="h-3 w-3/4 animate-pulse rounded bg-white/10" />
                <div className="h-2.5 w-1/2 animate-pulse rounded bg-white/[0.06]" />
              </li>
            ))}
          </ul>
        ) : items.length === 0 && listLoading ? (
          <div className="h-full" />
        ) : items.length === 0 && !listError && !unreadError && !actionError ? (
          <div className="flex h-full items-center justify-center px-3">
            <p className="text-sm text-gray-500">{t('inboxCaughtUp')}</p>
          </div>
        ) : items.length > 0 ? (
          <ul>
            {items.map((n) => (
              <li key={n.id} className="border-b border-white/5 last:border-0">
                <button
                  type="button"
                  onClick={() => void onItemClick(n)}
                  className={`flex min-h-11 w-full items-start gap-2.5 px-3 py-2.5 text-left transition hover:bg-white/5 ${
                    n.readAt ? 'opacity-70' : ''
                  }`}
                >
                  <span className="mt-0.5 text-gray-400" aria-hidden>
                    {iconFor(n.kind)}
                  </span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-sm font-medium text-white">{titleFor(n, t, i18n.language)}</span>
                    {snippetFor(n) ? <span className="line-clamp-2 text-xs text-gray-400">{snippetFor(n)}</span> : null}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {nextCursor && !listLoading ? (
          <div className="border-t border-white/10 px-2 py-2">
            <button
              type="button"
              className="min-h-11 w-full rounded py-1.5 text-xs font-medium text-gray-400 hover:bg-white/5 hover:text-white"
              onClick={() => void fetchList({ append: true })}
            >
              {t('inboxLoadMore')}
            </button>
          </div>
        ) : null}
        {listLoading && items.length > 0 ? (
          <p role="status" className="py-2 text-center text-xs text-gray-500">
            {tCommon('loading')}
          </p>
        ) : null}
      </SimpleBar>
    </div>
  )
}
