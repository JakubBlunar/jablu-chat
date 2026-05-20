import type { Message } from '@chat/shared'
import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ScrollToBottomButton } from '@/components/ScrollToBottomButton'
import { MessageRow } from '@/components/chat/MessageRow'
import { type ChannelRef } from '@/components/MarkdownContent'
import { formatDateSeparator, formatTimeOnly, isDifferentDay } from '@/lib/format-time'
import { Spinner } from '@/components/ui'
import type { ScrollState } from '@/components/chat/hooks/useMessageScroll'
import type { Member } from '@/stores/member.store'

const GROUP_GAP_MS = 5 * 60 * 1000

function isGap(a: Message, b: Message): boolean {
  const ta = new Date(a.createdAt).getTime()
  const tb = new Date(b.createdAt).getTime()
  if (Number.isNaN(ta) || Number.isNaN(tb)) return false
  return tb - ta > GROUP_GAP_MS
}

function DateSeparator({ date }: { date: string }) {
  return (
    <div className="my-2 flex items-center gap-3">
      <div className="h-px flex-1 bg-white/10" />
      <span className="text-[11px] font-semibold text-gray-400">{formatDateSeparator(date)}</span>
      <div className="h-px flex-1 bg-white/10" />
    </div>
  )
}

const NewMessagesDivider = ({
  label,
  innerRef
}: {
  label: string
  innerRef?: React.Ref<HTMLDivElement>
}) => (
  <div ref={innerRef} data-testid="new-messages-divider" className="my-2 flex items-center gap-3">
    <div className="h-px flex-1 bg-red-500/60" />
    <span className="rounded bg-red-500/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-red-400">
      {label}
    </span>
    <div className="h-px flex-1 bg-red-500/60" />
  </div>
)

export interface MessageSurfaceProps {
  scroll: ScrollState
  messages: Message[]
  isLoading: boolean
  hasMore: boolean
  hasNewer: boolean
  mode: 'channel' | 'dm'
  contextId: string

  emptyState?: React.ReactNode
  /** Renders at the visual top of the scroll area (e.g. forum root post, thread parent preview) */
  headerContent?: React.ReactNode
  lastOwnMsgId?: string | null
  seenByLabel?: string | null

  onReply: (msg: Message) => void
  onUserClick?: (userId: string, rect: DOMRect) => void
  onMentionClick?: (username: string, rect: DOMRect) => void
  channels?: ChannelRef[]
  onChannelClick?: (serverId: string, channelId: string) => void
  membersByUsername?: Map<string, Member>

  hideThreadAction?: boolean
  hidePinAction?: boolean
  hideBookmarkAction?: boolean

  /** First unread message id from the channel-open snapshot. Renders the divider and pill. */
  firstUnreadId?: string | null
  /** Number of new messages at channel-open time. */
  unreadCount?: number
  /** Timestamp of last read (used to render "since hh:mm" in the pill). */
  unreadSince?: string | null
  /** Called when the user clicks the top pill body to jump to the divider. */
  onJumpToUnread?: () => void
  /** Called when the user clicks "Mark As Read" on the pill. */
  onMarkAsRead?: () => void
}

export const MessageSurface = memo(function MessageSurface({
  scroll,
  messages,
  isLoading,
  hasMore,
  hasNewer,
  mode,
  contextId,
  emptyState,
  headerContent,
  lastOwnMsgId,
  seenByLabel,
  onReply,
  onUserClick,
  onMentionClick,
  channels,
  onChannelClick,
  membersByUsername,
  hideThreadAction,
  hidePinAction,
  hideBookmarkAction,
  firstUnreadId = null,
  unreadCount = 0,
  unreadSince = null,
  onJumpToUnread,
  onMarkAsRead
}: MessageSurfaceProps) {
  const { t: tChat } = useTranslation('chat')
  const renderedItems = useMemo(() => {
    const items: { msg: Message; showHead: boolean; newDay: boolean; isLastOwn: boolean }[] = []
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i]
      const prev = i > 0 ? messages[i - 1] : undefined
      const newDay = !prev || isDifferentDay(prev.createdAt, msg.createdAt)
      const showHead = newDay || !prev || prev.authorId !== msg.authorId || isGap(prev, msg)
      const isLastOwn = lastOwnMsgId != null && lastOwnMsgId === msg.id
      items.push({ msg, showHead, newDay, isLastOwn })
    }
    return items
  }, [messages, lastOwnMsgId])

  // True only when the divider message is present in the rendered list AND the
  // divider element is above the visible viewport (i.e. user has already
  // scrolled past it). In that case we hide the pill — they've seen the marker.
  const dividerRef = useRef<HTMLDivElement | null>(null)
  const [passedDivider, setPassedDivider] = useState(false)
  const dividerInList = firstUnreadId != null && messages.some((m) => m.id === firstUnreadId)
  const showPill = dividerInList && unreadCount > 0 && !passedDivider
  useEffect(() => {
    setPassedDivider(false)
  }, [firstUnreadId])
  useEffect(() => {
    const el = dividerRef.current
    const sp = scroll.scrollParentRef.current
    if (!el || !sp || !dividerInList) return
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (!entry) return
        const rect = entry.boundingClientRect
        const rootRect = entry.rootBounds
        if (!rootRect) return
        // Divider is considered "passed" once it's above the top of the viewport.
        setPassedDivider(!entry.isIntersecting && rect.bottom <= rootRect.top + 4)
      },
      { root: sp, threshold: 0 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [dividerInList, scroll.scrollParentRef])

  const pillTimeLabel = unreadSince ? formatTimeOnly(unreadSince) : ''

  const scrollChildren = (
    <>
      {headerContent}
      {emptyState ?? (
        <>
          {hasMore && <div ref={scroll.topSentinelRef} className="h-1 shrink-0" />}
          {isLoading && messages.length === 0 && (
            <div className="flex justify-center py-3">
              <Spinner size="md" />
            </div>
          )}
          {renderedItems.map(({ msg, showHead, newDay, isLastOwn }) => (
            <div key={msg.id} className="pb-0.5">
              {newDay && <DateSeparator date={msg.createdAt} />}
              {firstUnreadId === msg.id && (
                <NewMessagesDivider label={tChat('newMessagesDivider')} innerRef={dividerRef} />
              )}
              <MessageRow
                mode={mode}
                message={msg}
                showHead={showHead}
                contextId={contextId}
                onReply={onReply}
                onUserClick={onUserClick}
                onMentionClick={onMentionClick}
                channels={channels}
                onChannelClick={onChannelClick}
                membersByUsername={membersByUsername}
                hideThreadAction={hideThreadAction}
                hidePinAction={hidePinAction}
                hideBookmarkAction={hideBookmarkAction}
              />
              {isLastOwn && seenByLabel && (
                <div className="mr-4 mt-0.5 text-right text-[11px] text-gray-500">{seenByLabel}</div>
              )}
            </div>
          ))}
          <div className="h-6 shrink-0" />
          {hasNewer && <div ref={scroll.newerSentinelRef} className="h-1 shrink-0" />}
          <div ref={scroll.bottomSentinelRef} className="h-1 shrink-0" />
        </>
      )}
    </>
  )

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={scroll.scrollParentRef}
        role="log"
        aria-label="Messages"
        aria-live="polite"
        className={`chat-scroll h-full overflow-y-auto overscroll-contain px-4 py-2 [overflow-anchor:none]${scroll.settling ? ' invisible' : ''}`}
      >
        <div className="flex flex-col [overflow-anchor:none]">{scrollChildren}</div>
      </div>

      {showPill && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center px-3 pt-2">
          <button
            type="button"
            data-testid="new-messages-pill"
            onClick={onJumpToUnread}
            className="pointer-events-auto flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-text shadow-lg ring-1 ring-black/10 transition hover:bg-primary/90"
          >
            <span className="truncate">
              {tChat('newMessagesPill', { count: unreadCount, time: pillTimeLabel })}
            </span>
            {onMarkAsRead && (
              <span
                role="button"
                tabIndex={0}
                aria-label={tChat('markAsRead')}
                onClick={(e) => {
                  e.stopPropagation()
                  onMarkAsRead()
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    e.stopPropagation()
                    onMarkAsRead()
                  }
                }}
                className="cursor-pointer rounded px-1 text-[11px] uppercase tracking-wide opacity-90 hover:opacity-100"
              >
                {tChat('markAsRead')}
              </span>
            )}
          </button>
        </div>
      )}

      <ScrollToBottomButton
        atBottom={scroll.atBottom}
        hasNewer={hasNewer}
        isLoading={isLoading}
        messageCount={messages.length}
        contextId={contextId}
        onClick={scroll.handleBottomButtonClick}
      />
    </div>
  )
})
