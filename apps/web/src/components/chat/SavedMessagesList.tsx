import type { Message } from '@chat/shared'
import { useCallback, useEffect, useState } from 'react'
import SimpleBar from 'simplebar-react'
import { AttachmentPreview } from '@/components/AttachmentPreview'
import { LinkPreviewCard } from '@/components/LinkPreviewCard'
import { MessageMediaProvider } from '@/components/media/MessageMediaGallery'
import { MarkdownContent } from '@/components/MarkdownContent'
import { UserAvatar } from '@/components/UserAvatar'
import { formatSmartTimestamp } from '@/lib/format-time'
import { api } from '@/lib/api'
import { useBookmarkStore } from '@/stores/bookmark.store'
import { useDelayedFlag } from '@/hooks/useDelayedFlag'
import { IconButton } from '@/components/ui'

type BookmarkEntry = {
  id: string
  messageId: string
  note: string | null
  createdAt: string
  message: Message & { channel?: { id: string; name: string; serverId: string } }
}

export function SavedMessagesList({ onClose, onJump }: {
  onClose: () => void
  onJump?: (messageId: string, opts: { channelId?: string; serverId?: string; conversationId?: string }) => void
}) {
  const [bookmarks, setBookmarks] = useState<BookmarkEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(false)
  const showLoading = useDelayedFlag(loading)
  const removeBookmark = useBookmarkStore((s) => s.removeBookmark)

  const fetchBookmarks = useCallback(async (cursor?: string) => {
    try {
      const res = await api.getBookmarks(cursor) as { bookmarks: BookmarkEntry[]; hasMore: boolean }
      if (cursor) {
        setBookmarks((prev) => [...prev, ...res.bookmarks])
      } else {
        setBookmarks(res.bookmarks)
      }
      setHasMore(res.hasMore)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchBookmarks()
  }, [fetchBookmarks])

  const handleRemove = useCallback(async (messageId: string) => {
    await removeBookmark(messageId)
    setBookmarks((prev) => prev.filter((b) => b.messageId !== messageId))
  }, [removeBookmark])

  return (
    <>
      {showLoading && (
        <span className="absolute inset-x-0 top-0 z-10 h-0.5 animate-pulse bg-primary/70" />
      )}
      <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-3">
        <h3 className="text-sm font-semibold text-white">Saved Messages</h3>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1.5 text-gray-400 transition hover:bg-white/10 hover:text-white"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      {showLoading ? (
        <div className="min-h-0 flex-1 overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-start gap-2.5 px-4 py-3">
              <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-white/10" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-1/3 animate-pulse rounded bg-white/10" />
                <div className="h-3 w-4/5 animate-pulse rounded bg-white/[0.06]" />
                <div className="h-3 w-2/3 animate-pulse rounded bg-white/[0.06]" />
              </div>
            </div>
          ))}
        </div>
      ) : loading ? (
        <div className="min-h-0 flex-1" />
      ) : bookmarks.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center px-4 text-center">
          <p className="text-sm text-gray-400">
            No saved messages yet. Click the bookmark icon on any message to save it.
          </p>
        </div>
      ) : (
        <SimpleBar className="min-h-0 flex-1">
          <div className="divide-y divide-white/5">
            {bookmarks.map((b) => {
              const m = b.message
              const name = m.author?.displayName ?? m.author?.username ?? 'Deleted User'
              const attachments = m.attachments ?? []
              const linkPreviews = m.linkPreviews ?? []
              return (
                <div key={b.id} className="group/bm px-4 py-3">
                  <div className="flex items-start gap-2.5">
                    <UserAvatar username={name} avatarUrl={m.author?.avatarUrl ?? null} size="md" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm font-semibold text-white">{name}</span>
                        <time className="text-[11px] text-gray-500">{formatSmartTimestamp(m.createdAt)}</time>
                      </div>
                      {m.channel && (
                        <p className="text-[11px] text-gray-500">#{m.channel.name}</p>
                      )}
                      {!m.channel && m.directConversationId && (
                        <p className="text-[11px] text-gray-500">Direct Message</p>
                      )}
                      {m.content && (
                        <div className="mt-0.5 text-sm [&_p]:text-sm [&_p]:leading-relaxed [&_pre]:max-h-32 [&_pre]:overflow-auto">
                          <MarkdownContent content={m.content} />
                        </div>
                      )}
                      <MessageMediaProvider attachments={attachments} linkPreviews={linkPreviews}>
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
                      </MessageMediaProvider>
                      {!m.content && attachments.length === 0 && (
                        <p className="mt-0.5 text-sm italic text-gray-500">[empty message]</p>
                      )}
                    </div>
                    <IconButton
                      label="Remove bookmark"
                      variant="danger"
                      size="sm"
                      className="shrink-0 opacity-60 hover:opacity-100"
                      onClick={() => void handleRemove(b.messageId)}
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path d="M6 18 18 6M6 6l12 12" />
                      </svg>
                    </IconButton>
                  </div>
                  {onJump && (
                    <button
                      type="button"
                      onClick={() => onJump(b.messageId, {
                        channelId: m.channel?.id,
                        serverId: m.channel?.serverId,
                        conversationId: m.directConversationId ?? undefined
                      })}
                      className="mt-1.5 text-[11px] font-medium text-primary/70 transition hover:text-primary"
                    >
                      Jump to message
                    </button>
                  )}
                </div>
              )
            })}
            {hasMore && (
              <button
                type="button"
                onClick={() => {
                  const last = bookmarks[bookmarks.length - 1]
                  if (last) void fetchBookmarks(last.id)
                }}
                className="w-full p-3 text-center text-xs font-medium text-primary transition hover:text-primary-hover"
              >
                Load more
              </button>
            )}
          </div>
        </SimpleBar>
      )}
    </>
  )
}
