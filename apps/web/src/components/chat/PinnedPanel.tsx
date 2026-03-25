import type { Message } from '@chat/shared'
import { useCallback } from 'react'
import SimpleBar from 'simplebar-react'
import { AttachmentPreview } from '@/components/AttachmentPreview'
import { LinkPreviewCard } from '@/components/LinkPreviewCard'
import { MarkdownContent } from '@/components/MarkdownContent'
import { UserAvatar } from '@/components/UserAvatar'
import { formatSmartTimestamp } from '@/lib/format-time'
import { getSocket } from '@/lib/socket'

export function PinnedPanel({
  messages,
  loading,
  onClose,
  isAdminOrOwner,
  channelId,
  onJump
}: {
  messages: Message[]
  loading: boolean
  onClose: () => void
  isAdminOrOwner: boolean
  channelId: string
  onJump: (messageId: string) => void
}) {
  const handleUnpin = useCallback(
    (messageId: string) => {
      getSocket()?.emit('message:unpin', { messageId, channelId })
    },
    [channelId]
  )

  return (
    <div className="absolute right-2 top-14 z-30 flex max-h-[28rem] w-96 max-w-[calc(100vw-1rem)] flex-col rounded-lg bg-surface-dark shadow-2xl ring-1 ring-white/10 sm:right-4">
      <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-3">
        <h3 className="text-sm font-semibold text-white">Pinned Messages</h3>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-0.5 text-gray-400 transition hover:bg-white/10 hover:text-white"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <SimpleBar className="flex-1">
        {loading ? (
          <p className="p-4 text-center text-sm text-gray-400">Loading…</p>
        ) : messages.length === 0 ? (
          <p className="p-6 text-center text-sm text-gray-400">No pinned messages in this channel.</p>
        ) : (
          <div className="divide-y divide-white/5">
            {messages.map((m) => {
              const name = m.author?.displayName ?? m.author?.username ?? 'Deleted User'
              const attachments = m.attachments ?? []
              const linkPreviews = m.linkPreviews ?? []
              return (
                <div key={m.id} className="group/pin px-4 py-3">
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
                    {isAdminOrOwner && (
                      <button
                        type="button"
                        title="Unpin message"
                        onClick={() => handleUnpin(m.id)}
                        className="shrink-0 rounded p-1 text-gray-500 opacity-0 transition hover:bg-white/10 hover:text-red-400 group-hover/pin:opacity-100"
                      >
                        <svg
                          className="h-3.5 w-3.5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path d="M6 18 18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => onJump(m.id)}
                    className="mt-1.5 text-[11px] font-medium text-primary/70 transition hover:text-primary"
                  >
                    Jump to message
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </SimpleBar>
    </div>
  )
}
