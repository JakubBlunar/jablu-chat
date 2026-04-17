import type { Message } from '@chat/shared'
import { useCallback } from 'react'
import { AttachmentPreview } from '@/components/AttachmentPreview'
import { LinkPreviewCard } from '@/components/LinkPreviewCard'
import { MarkdownContent } from '@/components/MarkdownContent'
import { UserAvatar } from '@/components/UserAvatar'
import { formatSmartTimestamp } from '@/lib/format-time'
import { getSocket } from '@/lib/socket'
import { IconButton, Spinner } from '@/components/ui'

export function PinnedMessagesList({
  messages,
  loading,
  canUnpin,
  channelId,
  conversationId,
  onJump,
  emptyLabel,
  jumpLabel,
  className = ''
}: {
  messages: Message[]
  loading: boolean
  canUnpin: boolean
  channelId?: string
  conversationId?: string
  onJump: (messageId: string) => void
  emptyLabel: string
  jumpLabel: string
  className?: string
}) {
  const handleUnpin = useCallback(
    (messageId: string) => {
      if (conversationId) {
        getSocket()?.emit('dm:unpin', { messageId, conversationId })
      } else if (channelId) {
        getSocket()?.emit('message:unpin', { messageId, channelId })
      }
    },
    [channelId, conversationId]
  )

  if (loading) {
    return (
      <div className={`flex flex-col items-center justify-center gap-2 py-8 ${className}`}>
        <Spinner size="lg" />
        <p className="text-center text-sm text-gray-400">Loading…</p>
      </div>
    )
  }

  if (messages.length === 0) {
    return <p className={`px-3 py-6 text-center text-sm text-gray-400 ${className}`}>{emptyLabel}</p>
  }

  return (
    <div className={`divide-y divide-white/5 ${className}`}>
      {messages.map((m) => {
        const name = m.author?.displayName ?? m.author?.username ?? 'Deleted User'
        const attachments = m.attachments ?? []
        const linkPreviews = m.linkPreviews ?? []
        return (
          <div key={m.id} className="group/pin px-3 py-3">
            <div className="flex items-start gap-2.5">
              <UserAvatar username={name} avatarUrl={m.author?.avatarUrl ?? null} size="md" />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-semibold text-white">{name}</span>
                  <time className="text-[11px] text-gray-500">{formatSmartTimestamp(m.createdAt)}</time>
                </div>

                {m.content && (
                  <div className="mt-0.5 text-sm [&_p]:text-sm [&_p]:leading-relaxed [&_pre]:max-h-32 [&_pre]:overflow-auto">
                    <MarkdownContent content={m.content} />
                  </div>
                )}

                {attachments.length > 0 && (
                  <div className="mt-1 flex flex-col gap-1 [&_img]:max-h-40 [&_video]:max-h-40">
                    {attachments.map((att) => (
                      <AttachmentPreview key={att.id} attachment={att} />
                    ))}
                  </div>
                )}

                {linkPreviews.length > 0 && (
                  <div className="mt-1 flex flex-col gap-1">
                    {linkPreviews.map((lp) => (
                      <LinkPreviewCard key={lp.id} lp={lp} />
                    ))}
                  </div>
                )}

                {!m.content && attachments.length === 0 && (
                  <p className="mt-0.5 text-sm italic text-gray-500">[empty message]</p>
                )}
              </div>
              {canUnpin && (
                <IconButton
                  label="Unpin message"
                  variant="danger"
                  size="sm"
                  className="shrink-0 opacity-60 hover:opacity-100"
                  onClick={() => handleUnpin(m.id)}
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path d="M6 18 18 6M6 6l12 12" />
                  </svg>
                </IconButton>
              )}
            </div>
            <button
              type="button"
              onClick={() => onJump(m.id)}
              className="mt-1.5 text-[11px] font-medium text-primary/70 transition hover:text-primary"
            >
              {jumpLabel}
            </button>
          </div>
        )
      })}
    </div>
  )
}
