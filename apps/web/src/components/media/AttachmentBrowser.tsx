import type { Attachment } from '@chat/shared'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import SimpleBar from 'simplebar-react'
import { resolveMediaUrl } from '@/lib/api'
import { formatSmartTimestamp } from '@/lib/format-time'
import { AttachmentsPager } from '@/components/channel/AttachmentsPager'
import { MessageMediaProvider, useMessageMedia } from './MessageMediaGallery'

export type BrowsableAttachment = Attachment & { createdAt?: string; authorName?: string | null }
export type AttachmentPage = { items: BrowsableAttachment[]; total: number }
const PAGE_SIZE = 30

export function AttachmentBrowser({
  kind,
  loadPage,
  emptyLabel,
  onJump
}: {
  kind: 'media' | 'files'
  loadPage: (page: number, limit: number) => Promise<AttachmentPage>
  emptyLabel: string
  onJump?: (messageId: string) => void
}) {
  const { t } = useTranslation('chat')
  const { t: tCommon } = useTranslation('common')
  const [page, setPage] = useState(0)
  const [data, setData] = useState<AttachmentPage>({ items: [], total: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(false)
    void loadPage(page, PAGE_SIZE).then(
      (result) => {
        if (cancelled) return
        if (page > 0 && result.items.length === 0 && result.total <= page * PAGE_SIZE) {
          setPage(Math.max(0, Math.ceil(result.total / PAGE_SIZE) - 1))
        } else {
          setData(result)
        }
        setLoading(false)
      },
      () => {
        if (!cancelled) {
          setError(true)
          setLoading(false)
        }
      }
    )
    return () => { cancelled = true }
  }, [loadPage, page, attempt])

  if (loading) return <p role="status" className="px-3 py-8 text-center text-sm text-gray-400">{tCommon('loading')}</p>
  if (error) return (
    <div role="alert" className="px-3 py-8 text-center text-sm text-gray-400">
      <p>{t('conversationLoadFailed')}</p>
      <button type="button" onClick={() => setAttempt((n) => n + 1)} className="mt-2 text-primary">{t('conversationRetry')}</button>
    </div>
  )
  if (data.total === 0) return <p className="px-3 py-8 text-center text-sm text-gray-400">{emptyLabel}</p>

  return (
    <div className="flex h-full min-h-0 flex-col">
      <SimpleBar className="min-h-0 flex-1" style={{ maxHeight: '100%' }}>
        <MessageMediaProvider attachments={data.items}>
          <div className={kind === 'media' ? 'grid grid-cols-3 gap-1.5 px-2 py-3' : 'space-y-2 px-2 py-3'}>
            {data.items.map((attachment) => (
              <div key={attachment.id} className="min-w-0">
                {kind === 'media' ? <MediaThumb attachment={attachment} /> : (
                  <a
                    href={resolveMediaUrl(attachment.url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    download={attachment.filename}
                    className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-sm text-blue-400 hover:bg-white/10"
                    aria-label={t('conversationDownload', { name: attachment.filename })}
                  >
                    <span className="text-xl" aria-hidden>&darr;</span>
                    <span className="min-w-0">
                      <span className="block truncate">{attachment.filename}</span>
                      <span className="block text-xs text-gray-400">{formatBytes(attachment.sizeBytes)}</span>
                    </span>
                  </a>
                )}
                {attachment.createdAt && kind === 'files' && (
                  <p className="mt-1 truncate text-xs text-gray-400">
                    {attachment.authorName ?? t('deletedUser')} &middot; {formatSmartTimestamp(attachment.createdAt)}
                  </p>
                )}
                {onJump && attachment.messageId && (
                  <button type="button" onClick={() => { if (attachment.messageId) onJump(attachment.messageId) }} className="mt-1 text-left text-[11px] text-primary hover:underline">
                    {t('jumpToMessage')}
                  </button>
                )}
              </div>
            ))}
          </div>
        </MessageMediaProvider>
      </SimpleBar>
      <AttachmentsPager page={page} pageSize={PAGE_SIZE} total={data.total} onPrev={() => setPage((n) => Math.max(0, n - 1))} onNext={() => setPage((n) => n + 1)} />
    </div>
  )
}

function MediaThumb({ attachment }: { attachment: Attachment }) {
  const { openByKey } = useMessageMedia()
  const isVideo = attachment.type === 'video'
  const src = resolveMediaUrl(attachment.thumbnailUrl ?? attachment.url) ?? attachment.url
  return (
    <button type="button" aria-label={attachment.filename} onClick={() => openByKey(attachment.id)} className="group relative block aspect-square w-full overflow-hidden rounded-md bg-black/30">
      {isVideo && !attachment.thumbnailUrl ? (
        <video src={`${resolveMediaUrl(attachment.url) ?? attachment.url}#t=0.1`} muted preload="metadata" className="h-full w-full object-cover" />
      ) : (
        <img src={src} alt={attachment.filename} loading="lazy" className="h-full w-full object-cover transition group-hover:opacity-90" />
      )}
      {isVideo && <span aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/10 text-2xl text-white">&#9654;</span>}
      {attachment.type === 'gif' && <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 text-[9px] font-bold text-white">GIF</span>}
    </button>
  )
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
