import type { Message } from '@chat/shared'
import { useCallback, useEffect, useState } from 'react'
import SimpleBar from 'simplebar-react'
import { AttachmentPreview } from '@/components/AttachmentPreview'
import { LinkPreviewCard } from '@/components/LinkPreviewCard'
import { MarkdownContent } from '@/components/MarkdownContent'
import { UserAvatar } from '@/components/UserAvatar'
import { formatSmartTimestamp } from '@/lib/format-time'
import { api } from '@/lib/api'
import { useBookmarkStore } from '@/stores/bookmark.store'

type BookmarkEntry = {
  id: string
  messageId: string
  note: string | null
  createdAt: string
  message: Message & { channel?: { id: string; name: string; serverId: string } }
}

export function SavedMessagesPanel({ onClose, onJump }: {
  onClose: () => void
  onJump?: (messageId: string, opts: { channelId?: string; serverId?: string; conversationId?: string }) => void
}) {
  const [bookmarks, setBookmarks] = useState<BookmarkEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(false)
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
    <div className="absolute right-2 top-14 z-30 flex max-h-[28rem] w-96 max-w-[calc(100vw-1rem)] flex-col rounded-lg bg-surface-dark shadow-2xl ring-1 ring-white/10 sm:right-4">
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
      <SimpleBar className="flex-1">
        {loading ? (
          <p className="p-4 text-center text-sm text-gray-400">Loading…</p>
        ) : bookmarks.length === 0 ? (
          <p className="p-6 text-center text-sm text-gray-400">
            No saved messages yet. Click the bookmark icon on any message to save it.
          </p>
        ) : (
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
                    <button
                      type="button"
                      title="Remove bookmark"
                      onClick={() => void handleRemove(b.messageId)}
                      className="shrink-0 rounded p-1 text-gray-500 opacity-60 transition hover:bg-white/10 hover:text-red-400 hover:opacity-100"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path d="M6 18 18 6M6 6l12 12" />
                      </svg>
                    </button>
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
        )}
      </SimpleBar>
    </div>
  )
}
