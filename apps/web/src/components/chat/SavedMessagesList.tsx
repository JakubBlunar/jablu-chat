import type { Message } from '@chat/shared'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
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

export type SavedMessageLocation = {
  channelId?: string
  serverId?: string
  conversationId?: string
  threadParentId?: string
}

export function SavedMessagesList({
  onClose,
  onJump
}: {
  onClose: () => void
  onJump?: (messageId: string, opts: SavedMessageLocation) => void
}) {
  const { t } = useTranslation('chat')
  const { t: tCommon } = useTranslation('common')
  const [bookmarks, setBookmarks] = useState<BookmarkEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(false)
  const [loadError, setLoadError] = useState<{ cursor?: string } | null>(null)
  const [actionError, setActionError] = useState(false)
  const [removing, setRemoving] = useState<string[]>([])
  const busy = useRef(false)
  const requestId = useRef(0)
  const showLoading = useDelayedFlag(loading)
  const removeBookmark = useBookmarkStore((s) => s.removeBookmark)

  const fetchBookmarks = useCallback(async (cursor?: string) => {
    if (busy.current) return
    busy.current = true
    const request = ++requestId.current
    setLoading(true)
    setLoadError(null)
    try {
      const res = (await api.getBookmarks(cursor)) as { bookmarks: BookmarkEntry[]; hasMore: boolean }
      if (request !== requestId.current) return
      if (cursor) {
        setBookmarks((prev) => [...prev, ...res.bookmarks.filter((entry) => !prev.some((old) => old.id === entry.id))])
      } else {
        setBookmarks(res.bookmarks)
      }
      setHasMore(res.hasMore)
    } catch (error) {
      console.error('Failed to load saved messages', error)
      if (request === requestId.current) setLoadError({ cursor })
    } finally {
      if (request === requestId.current) {
        busy.current = false
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    const requests = requestId
    void fetchBookmarks()
    return () => {
      requests.current++
      busy.current = false
    }
  }, [fetchBookmarks])

  const handleRemove = useCallback(
    async (messageId: string) => {
      setRemoving((ids) => [...ids, messageId])
      setActionError(false)
      try {
        await removeBookmark(messageId)
        setBookmarks((prev) => prev.filter((b) => b.messageId !== messageId))
      } catch (error) {
        console.error('Failed to remove saved message', error)
        setActionError(true)
      } finally {
        setRemoving((ids) => ids.filter((id) => id !== messageId))
      }
    },
    [removeBookmark]
  )

  return (
    <>
      {showLoading && <span className="absolute inset-x-0 top-0 z-10 h-0.5 animate-pulse bg-primary/70" />}
      <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-3">
        <h3 className="text-sm font-semibold text-white">{t('savedMessagesTitle')}</h3>
        <button
          type="button"
          onClick={onClose}
          aria-label={tCommon('close')}
          className="flex h-11 w-11 items-center justify-center rounded text-gray-400 transition hover:bg-white/10 hover:text-white"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      {(loadError || actionError) && (
        <div role="alert" className="shrink-0 border-b border-white/10 px-4 py-2 text-sm text-red-300">
          <p>{t(actionError ? 'bookmarkActionFailed' : 'savedMessagesFailed')}</p>
          {loadError && (
            <button
              type="button"
              disabled={loading}
              className="min-h-11 text-primary disabled:opacity-50"
              onClick={() => void fetchBookmarks(loadError.cursor)}
            >
              {tCommon('retry')}
            </button>
          )}
        </div>
      )}
      {showLoading && bookmarks.length === 0 ? (
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
      ) : (loading || loadError) && bookmarks.length === 0 ? (
        <div className="min-h-0 flex-1" />
      ) : bookmarks.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center px-4 text-center">
          <p className="text-sm text-gray-400">{t('savedMessagesEmpty')}</p>
        </div>
      ) : (
        <SimpleBar className="min-h-0 flex-1">
          <div className="divide-y divide-white/5">
            {bookmarks.map((b) => {
              const m = b.message
              const name = m.author?.displayName ?? m.author?.username ?? t('deletedUser')
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
                      {m.channel && <p className="text-[11px] text-gray-500">#{m.channel.name}</p>}
                      {!m.channel && m.directConversationId && (
                        <p className="text-[11px] text-gray-500">{t('directMessage')}</p>
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
                        <p className="mt-0.5 text-sm italic text-gray-500">{t('emptyMessage')}</p>
                      )}
                    </div>
                    <IconButton
                      label={t('actionRemoveBookmark')}
                      disabled={removing.includes(b.messageId)}
                      variant="danger"
                      size="sm"
                      className="shrink-0 opacity-60 hover:opacity-100"
                      onClick={() => void handleRemove(b.messageId)}
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
                    </IconButton>
                  </div>
                  {onJump && (
                    <button
                      type="button"
                      onClick={() =>
                        onJump(b.messageId, {
                          channelId: m.channel?.id,
                          serverId: m.channel?.serverId,
                          conversationId: m.directConversationId ?? undefined,
                          threadParentId: m.threadParentId ?? undefined
                        })
                      }
                      className="mt-1.5 min-h-11 text-[11px] font-medium text-primary/70 transition hover:text-primary"
                    >
                      {t('jumpToMessage')}
                    </button>
                  )}
                </div>
              )
            })}
            {hasMore && (
              <button
                type="button"
                disabled={loading}
                onClick={() => {
                  const last = bookmarks[bookmarks.length - 1]
                  if (last) void fetchBookmarks(last.id)
                }}
                className="w-full p-3 text-center text-xs font-medium text-primary transition hover:text-primary-hover"
              >
                {loading ? tCommon('loading') : t('savedLoadMore')}
              </button>
            )}
          </div>
        </SimpleBar>
      )}
    </>
  )
}
