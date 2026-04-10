import type { Message } from '@chat/shared'
import { memo, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { ScrollToBottomButton } from '@/components/ScrollToBottomButton'
import { MessageRow } from '@/components/chat/MessageRow'
import { type ChannelRef } from '@/components/MarkdownContent'
import { formatDateSeparator, isDifferentDay } from '@/lib/format-time'
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
  hideBookmarkAction
}: MessageSurfaceProps) {
  const { t } = useTranslation('chat')
  const renderedItems = useMemo(() => {
    const items: { msg: Message; showHead: boolean; newDay: boolean; isLastOwn: boolean }[] = []
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]
      const prev = i > 0 ? messages[i - 1] : undefined
      const newDay = !prev || isDifferentDay(prev.createdAt, msg.createdAt)
      const showHead = newDay || !prev || prev.authorId !== msg.authorId || isGap(prev, msg)
      const isLastOwn = lastOwnMsgId != null && lastOwnMsgId === msg.id
      items.push({ msg, showHead, newDay, isLastOwn })
    }
    return items
  }, [messages, lastOwnMsgId])

  const scrollChildren = (
    <>
      {emptyState ?? (
        <>
          <div ref={scroll.bottomSentinelRef} className="h-1 shrink-0" />
          {hasNewer && <div ref={scroll.newerSentinelRef} className="h-1 shrink-0" />}
          <div className="h-6 shrink-0" />
          {renderedItems.map(({ msg, showHead, newDay, isLastOwn }) => (
            <div key={msg.id} className="pb-0.5">
              {newDay && <DateSeparator date={msg.createdAt} />}
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
          {hasMore && <div ref={scroll.topSentinelRef} className="h-1 shrink-0" />}
          {isLoading && messages.length === 0 && (
            <div className="flex justify-center py-3">
              <Spinner size="md" />
            </div>
          )}
        </>
      )}
      {headerContent}
    </>
  )

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={scroll.scrollParentRef}
        role="region"
        aria-label={t('messageListLabel')}
        className={`chat-scroll flex h-full flex-col-reverse overflow-y-auto overscroll-contain px-4 py-2${scroll.settling ? ' invisible' : ''}`}
      >
        {scrollChildren}
      </div>

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
