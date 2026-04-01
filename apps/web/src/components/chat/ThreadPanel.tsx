import type { Message } from '@chat/shared'
import { useCallback, useState } from 'react'
import { MessageSurface } from '@/components/chat/MessageSurface'
import { UnifiedInput } from '@/components/chat/UnifiedInput'
import { UserAvatar } from '@/components/UserAvatar'
import { MarkdownContent } from '@/components/MarkdownContent'
import { formatSmartTimestamp } from '@/lib/format-time'
import { useIsMobile } from '@/hooks/useMobile'
import { useThreadStore } from '@/stores/thread.store'
import { useThreadSurfaceAdapter } from '@/hooks/useThreadSurfaceAdapter'
import { useMessageScroll } from '@/components/chat/hooks/useMessageScroll'
import { IconButton, Spinner } from '@/components/ui'

export function ThreadPanel({ gifEnabled, onCommand }: { gifEnabled?: boolean; onCommand?: (cmd: string, args?: string) => void }) {
  const { isOpen, parentMessage, channelId, closeThread, reconcileToLatest } = useThreadStore()
  const adapter = useThreadSurfaceAdapter()
  const contextId = isOpen && parentMessage ? parentMessage.id : null
  const scroll = useMessageScroll(contextId, adapter)

  const [replyTarget, setReplyTarget] = useState<{
    id: string
    content: string | null
    authorName: string
  } | null>(null)

  const handleReply = useCallback((msg: Message) => {
    setReplyTarget({
      id: msg.id,
      content: msg.content,
      authorName: msg.author?.displayName ?? msg.author?.username ?? 'Unknown'
    })
  }, [])

  const isMobile = useIsMobile()

  if (!isOpen || !parentMessage || !channelId) return null

  const parentName = parentMessage.author?.displayName ?? parentMessage.author?.username ?? 'Deleted User'

  const parentPreview = (
    <div className="border-b border-white/10 p-4">
      <div className="flex items-start gap-2.5">
        <UserAvatar
          username={parentName}
          avatarUrl={parentMessage.author?.avatarUrl ?? null}
          size="md"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-semibold text-white">{parentName}</span>
            <time className="text-[11px] text-gray-500">
              {formatSmartTimestamp(parentMessage.createdAt)}
            </time>
          </div>
          {parentMessage.content && (
            <div className="mt-0.5 text-sm text-gray-300">
              <MarkdownContent content={parentMessage.content} />
            </div>
          )}
        </div>
      </div>
    </div>
  )

  const emptyState =
    adapter.isLoading && adapter.messages.length === 0 ? (
      <div className="flex flex-1 flex-col items-center justify-center py-8">
        <Spinner size="md" />
      </div>
    ) : !adapter.isLoading && adapter.messages.length === 0 ? (
      <p className="py-8 text-center text-xs text-gray-500">No replies yet. Start the thread!</p>
    ) : undefined

  return (
    <div className={`flex min-h-0 shrink-0 flex-col border-l border-white/10 bg-surface-dark ${isMobile ? 'absolute inset-0 z-20 w-full border-l-0' : 'w-80'}`}>
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-white/10 px-4">
        <h3 className="text-sm font-semibold text-white">Thread</h3>
        <IconButton label="Close thread" variant="ghost" size="md" onClick={closeThread}>
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path d="M6 18 18 6M6 6l12 12" />
          </svg>
        </IconButton>
      </div>

      <MessageSurface
        scroll={scroll}
        messages={adapter.messages}
        isLoading={adapter.isLoading}
        hasMore={adapter.hasMore}
        hasNewer={adapter.hasNewer}
        mode="channel"
        contextId={channelId}
        headerContent={parentPreview}
        emptyState={emptyState}
        onReply={handleReply}
      />

      <UnifiedInput
        mode="channel"
        contextId={channelId}
        threadParentId={parentMessage.id}
        replyTarget={replyTarget}
        onCancelReply={() => setReplyTarget(null)}
        onSent={() => {
          void reconcileToLatest().then(() => scroll.stickToBottom())
        }}
        gifEnabled={gifEnabled}
        onCommand={onCommand}
        placeholder="Reply in thread..."
      />
    </div>
  )
}
