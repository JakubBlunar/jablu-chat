import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { InAppNotificationDto } from '@/lib/api/types'
import { api } from '@/lib/api'
import { useAppNavigate } from '@/hooks/useAppNavigate'
import { useDelayedFlag } from '@/hooks/useDelayedFlag'
import { CountBadge } from '@/components/ui'
import { useNotificationCenterStore } from '@/stores/notificationCenter.store'
import { useMessageStore } from '@/stores/message.store'
import { useThreadStore } from '@/stores/thread.store'
import type { Message } from '@chat/shared'

function titleFor(n: InAppNotificationDto): string {
  const p = n.payload
  switch (n.kind) {
    case 'mention': {
      const name = typeof p.authorName === 'string' ? p.authorName : 'Someone'
      const ch = typeof p.channelName === 'string' ? p.channelName : 'channel'
      return `${name} mentioned you in #${ch}`
    }
    case 'dm_message': {
      const name = typeof p.authorName === 'string' ? p.authorName : 'Someone'
      const c = typeof p.count === 'number' && p.count > 1 ? `${p.count} messages` : 'Direct message'
      return `${name} — ${c}`
    }
    case 'thread_reply': {
      const name = typeof p.authorName === 'string' ? p.authorName : 'Someone'
      const ch = typeof p.channelName === 'string' ? p.channelName : 'channel'
      const c = typeof p.count === 'number' && p.count > 1 ? `${p.count} replies` : 'Thread reply'
      return `${name} in #${ch} — ${c}`
    }
    case 'channel_message': {
      const name = typeof p.authorName === 'string' ? p.authorName : 'Someone'
      const ch = typeof p.channelName === 'string' ? p.channelName : 'channel'
      const c = typeof p.count === 'number' && p.count > 1 ? `${p.count} new messages` : 'New message'
      return `${name} in #${ch} — ${c}`
    }
    case 'reply': {
      const name = typeof p.authorName === 'string' ? p.authorName : 'Someone'
      const ch = typeof p.channelName === 'string' ? p.channelName : 'channel'
      return `${name} replied to you in #${ch}`
    }
    case 'friend_request': {
      const name = typeof p.requesterName === 'string' ? p.requesterName : 'Someone'
      return `${name} sent a friend request`
    }
    case 'friend_accepted': {
      const name = typeof p.userName === 'string' ? p.userName : 'Someone'
      return `${name} accepted your friend request`
    }
    case 'moderation': {
      const server = typeof p.serverName === 'string' ? p.serverName : 'a server'
      const action = p.action
      if (action === 'ban') return `You were banned from ${server}`
      if (action === 'kick') return `You were removed from ${server}`
      return `You were timed out in ${server}`
    }
    case 'role_changed': {
      const server = typeof p.serverName === 'string' ? p.serverName : 'a server'
      const added = Array.isArray(p.added) ? (p.added as string[]) : []
      const removed = Array.isArray(p.removed) ? (p.removed as string[]) : []
      if (added.length > 0 && removed.length === 0) {
        return `You were given ${formatList(added)} in ${server}`
      }
      if (removed.length > 0 && added.length === 0) {
        return `You lost ${formatList(removed)} in ${server}`
      }
      return `Your roles changed in ${server}`
    }
    case 'level_up': {
      const server = typeof p.serverName === 'string' ? p.serverName : 'a server'
      const level = typeof p.level === 'number' ? p.level : null
      return level === null ? `You levelled up in ${server}` : `You reached level ${level} in ${server}`
    }
    case 'server_event': {
      const name = typeof p.eventName === 'string' ? p.eventName : 'An event'
      return p.state === 'soon' ? `${name} starts soon` : `${name} is starting now`
    }
    case 'announcement': {
      const title = typeof p.title === 'string' ? p.title : null
      return title ?? 'Announcement'
    }
    default:
      return 'Notification'
  }
}

function formatList(names: string[]): string {
  if (names.length === 1) return names[0]!
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
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

export function InAppNotificationBell({
  className = '',
  size = 'md'
}: {
  className?: string
  size?: 'sm' | 'md' | 'rail'
}) {
  const [open, setOpen] = useState(false)
  const [panelPos, setPanelPos] = useState<{
    left: number
    top?: number
    bottom?: number
    height: number
  } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const unreadCount = useNotificationCenterStore((s) => s.unreadCount)
  const items = useNotificationCenterStore((s) => s.items)
  const listLoading = useNotificationCenterStore((s) => s.listLoading)
  const nextCursor = useNotificationCenterStore((s) => s.nextCursor)
  const fetchUnread = useNotificationCenterStore((s) => s.fetchUnread)
  const fetchList = useNotificationCenterStore((s) => s.fetchList)
  const markRead = useNotificationCenterStore((s) => s.markRead)
  const markAllRead = useNotificationCenterStore((s) => s.markAllRead)
  const showLoading = useDelayedFlag(listLoading)
  const { orchestratedGoToChannel, orchestratedGoToDm, navigate } = useAppNavigate()

  useEffect(() => {
    void fetchUnread()
  }, [fetchUnread])

  const setPanelOpen = useNotificationCenterStore((s) => s.setPanelOpen)

  useEffect(() => {
    setPanelOpen(open)
    return () => setPanelOpen(false)
  }, [open, setPanelOpen])

  useEffect(() => {
    if (!open) return
    void fetchList()
  }, [open, fetchList])

  // Anchor the dropdown to the button and clamp it within the viewport so it
  // works from the title bar, server rail, or mobile footer alike. Flips upward
  // when the trigger sits too low to fit the panel below.
  useLayoutEffect(() => {
    if (!open || !btnRef.current) return
    const reposition = () => {
      const rect = btnRef.current?.getBoundingClientRect()
      if (!rect) return
      const margin = 8
      const gap = 6
      const panelWidth = Math.min(window.innerWidth - 16, 380)
      const maxLeft = window.innerWidth - panelWidth - margin
      const left = Math.max(margin, Math.min(rect.right - panelWidth, maxLeft))

      const spaceBelow = window.innerHeight - rect.bottom - margin
      const spaceAbove = rect.top - margin
      const openDown = spaceBelow >= 320 || spaceBelow >= spaceAbove
      const avail = openDown ? spaceBelow : spaceAbove
      const height = Math.min(460, avail)
      if (openDown) {
        setPanelPos({ left, top: rect.bottom + gap, height })
      } else {
        setPanelPos({ left, bottom: window.innerHeight - rect.top + gap, height })
      }
    }
    reposition()
    window.addEventListener('resize', reposition)
    return () => window.removeEventListener('resize', reposition)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (
        panelRef.current?.contains(e.target as Node) ||
        btnRef.current?.contains(e.target as Node)
      ) {
        return
      }
      setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])

  const onItemClick = useCallback(
    async (n: InAppNotificationDto) => {
      const p = n.payload
      try {
        if (n.kind === 'mention') {
          const serverId = typeof p.serverId === 'string' ? p.serverId : null
          const channelId = typeof p.channelId === 'string' ? p.channelId : null
          const messageId = typeof p.messageId === 'string' ? p.messageId : null
          if (serverId && channelId && messageId) {
            await orchestratedGoToChannel(serverId, channelId, messageId)
          }
        } else if (n.kind === 'dm_message') {
          const conv = typeof p.conversationId === 'string' ? p.conversationId : null
          const messageId = typeof p.messageId === 'string' ? p.messageId : null
          if (conv) {
            await orchestratedGoToDm(conv, messageId ?? null)
          }
        } else if (n.kind === 'thread_reply') {
          const serverId = typeof p.serverId === 'string' ? p.serverId : null
          const channelId = typeof p.channelId === 'string' ? p.channelId : null
          const threadParentId = typeof p.threadParentId === 'string' ? p.threadParentId : null
          const messageId = typeof p.messageId === 'string' ? p.messageId : null
          if (serverId && channelId && threadParentId) {
            await orchestratedGoToChannel(serverId, channelId)
            const openWithParent = (msg: Message) => {
              useThreadStore.getState().openThread(channelId, msg, { focusMessageId: messageId ?? undefined })
            }
            const existing = useMessageStore.getState().messages.find((m) => m.id === threadParentId)
            if (existing) {
              openWithParent(existing)
            } else {
              const res = await api.get<{ messages: Message[] }>(
                `/api/channels/${channelId}/messages?around=${threadParentId}&limit=5`
              )
              const parent = res.messages.find((m) => m.id === threadParentId)
              if (parent) openWithParent(parent)
            }
          }
        } else if (n.kind === 'channel_message' || n.kind === 'reply') {
          const serverId = typeof p.serverId === 'string' ? p.serverId : null
          const channelId = typeof p.channelId === 'string' ? p.channelId : null
          const messageId = typeof p.messageId === 'string' ? p.messageId : null
          if (serverId && channelId) {
            await orchestratedGoToChannel(serverId, channelId, messageId ?? undefined)
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
        if (!n.readAt) void markRead(n.id)
        setOpen(false)
      }
    },
    [markRead, navigate, orchestratedGoToChannel, orchestratedGoToDm]
  )

  const panel =
    open &&
    panelPos &&
    createPortal(
      <div
        ref={panelRef}
        className="fixed z-[140] flex w-[min(100vw-16px,380px)] flex-col overflow-hidden rounded-lg border border-white/10 bg-surface-dark py-2 shadow-xl ring-1 ring-black/40"
        style={{
          left: panelPos.left,
          top: panelPos.top,
          bottom: panelPos.bottom,
          height: panelPos.height
        }}
      >
        {showLoading && (
          <span className="absolute inset-x-0 top-0 z-10 h-0.5 animate-pulse bg-primary/70" />
        )}
        <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-3 pb-2">
          <span className="text-sm font-semibold text-white">Inbox</span>
          {unreadCount > 0 && (
            <button
              type="button"
              className="text-xs font-medium text-primary hover:underline"
              onClick={() => void markAllRead()}
            >
              Mark all as seen
            </button>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
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
          ) : items.length === 0 ? (
            <div className="flex h-full items-center justify-center px-3">
              <p className="text-sm text-gray-500">You&apos;re all caught up.</p>
            </div>
          ) : (
            <ul>
              {items.map((n) => (
                <li key={n.id} className="border-b border-white/5 last:border-0">
                  <button
                    type="button"
                    onClick={() => void onItemClick(n)}
                    className={`flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition hover:bg-white/5 ${
                      n.readAt ? 'opacity-70' : ''
                    }`}
                  >
                    <span className="mt-0.5 text-gray-400" aria-hidden>
                      {iconFor(n.kind)}
                    </span>
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-sm font-medium text-white">{titleFor(n)}</span>
                      {snippetFor(n) ? (
                        <span className="line-clamp-2 text-xs text-gray-400">{snippetFor(n)}</span>
                      ) : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {nextCursor && !listLoading ? (
            <div className="border-t border-white/10 px-2 py-2">
              <button
                type="button"
                className="w-full rounded py-1.5 text-xs font-medium text-gray-400 hover:bg-white/5 hover:text-white"
                onClick={() => void fetchList({ append: true })}
              >
                Load more
              </button>
            </div>
          ) : null}
          {listLoading && items.length > 0 ? (
            <p className="py-2 text-center text-xs text-gray-500">Loading…</p>
          ) : null}
        </div>
      </div>,
      document.body
    )

  const buttonSize = size === 'sm' ? 'h-7 w-7' : size === 'rail' ? 'h-9 w-9' : 'h-10 w-10'
  const iconSize = size === 'md' ? 'h-5 w-5' : 'h-[18px] w-[18px]'

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label={`Inbox${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
        title="Inbox"
        onClick={() => setOpen((o) => !o)}
        className={`relative flex ${buttonSize} shrink-0 items-center justify-center rounded-md text-gray-400 transition hover:bg-white/10 hover:text-white ${className}`}
      >
        <svg className={iconSize} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 12h-6l-2 3h-4l-2-3H2" />
          <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
        </svg>
        <CountBadge
          count={unreadCount}
          variant="danger"
          className="absolute -right-0.5 -top-0.5 min-w-[1rem] px-0.5 text-[10px]"
        />
      </button>
      {panel}
    </>
  )
}
