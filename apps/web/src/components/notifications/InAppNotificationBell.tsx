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
        } else if (n.kind === 'channel_message') {
          const serverId = typeof p.serverId === 'string' ? p.serverId : null
          const channelId = typeof p.channelId === 'string' ? p.channelId : null
          const messageId = typeof p.messageId === 'string' ? p.messageId : null
          if (serverId && channelId) {
            await orchestratedGoToChannel(serverId, channelId, messageId ?? undefined)
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
