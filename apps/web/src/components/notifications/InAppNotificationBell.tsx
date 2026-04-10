import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { InAppNotificationDto } from '@/lib/api/types'
import { api } from '@/lib/api'
import { useAppNavigate } from '@/hooks/useAppNavigate'
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
    case 'friend_request': {
      const name = typeof p.requesterName === 'string' ? p.requesterName : 'Someone'
      return `${name} sent a friend request`
    }
    default:
      return 'Notification'
  }
}

function snippetFor(n: InAppNotificationDto): string {
  const s = n.payload.snippet
  return typeof s === 'string' ? s : ''
}

export function InAppNotificationBell({ className = '' }: { className?: string }) {
  const [open, setOpen] = useState(false)
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
  const { orchestratedGoToChannel, orchestratedGoToDm, navigate } = useAppNavigate()

  useEffect(() => {
    void fetchUnread()
  }, [fetchUnread])

  useEffect(() => {
    if (!open) return
    void fetchList()
  }, [open, fetchList])

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
        } else if (n.kind === 'friend_request') {
          navigate('/channels/@me')
        }
      } finally {
        if (!n.readAt) void markRead(n.id)
        setOpen(false)
      }
    },
    [markRead, navigate, orchestratedGoToChannel, orchestratedGoToDm]
  )

  const panel =
    open &&
    createPortal(
      <div
        ref={panelRef}
        className="fixed z-[140] w-[min(100vw-16px,380px)] rounded-lg border border-white/10 bg-surface-dark py-2 shadow-xl ring-1 ring-black/40"
        style={{
          top: btnRef.current ? btnRef.current.getBoundingClientRect().bottom + 6 : 48,
          right: 8
        }}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-3 pb-2">
          <span className="text-sm font-semibold text-white">Notifications</span>
          {unreadCount > 0 && (
            <button
              type="button"
              className="text-xs font-medium text-primary hover:underline"
              onClick={() => void markAllRead()}
            >
              Mark all read
            </button>
          )}
        </div>
        <div className="max-h-[min(70vh,420px)] overflow-y-auto">
          {listLoading && items.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-gray-500">Loading…</p>
          ) : items.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-gray-500">You&apos;re all caught up.</p>
          ) : (
            <ul>
              {items.map((n) => (
                <li key={n.id} className="border-b border-white/5 last:border-0">
                  <button
                    type="button"
                    onClick={() => void onItemClick(n)}
                    className={`flex w-full flex-col gap-0.5 px-3 py-2.5 text-left transition hover:bg-white/5 ${
                      n.readAt ? 'opacity-70' : ''
                    }`}
                  >
                    <span className="text-sm font-medium text-white">{titleFor(n)}</span>
                    {snippetFor(n) ? (
                      <span className="line-clamp-2 text-xs text-gray-400">{snippetFor(n)}</span>
                    ) : null}
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

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
        title="Notifications"
        onClick={() => setOpen((o) => !o)}
        className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-gray-400 transition hover:bg-white/10 hover:text-white ${className}`}
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
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
