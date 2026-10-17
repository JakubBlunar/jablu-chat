import type { Attachment } from '@chat/shared'
import { useTranslation } from 'react-i18next'
import { resolveMediaUrl } from '@/lib/api'
import { formatSmartTimestamp } from '@/lib/format-time'
import { PagedContent } from '@/components/ui/PagedContent'
import { MessageMediaProvider, useMessageMedia } from './MessageMediaGallery'
import { MediaPreview } from './MediaPreview'
import { FileDownloadActions } from './FileDownloadActions'
import { formatBytes } from '@/lib/format-bytes'

export type BrowsableAttachment = Attachment & { createdAt?: string; authorName?: string | null }
export type AttachmentPage = { items: BrowsableAttachment[]; total: number }

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
  return (
    <PagedContent loadPage={loadPage} emptyLabel={emptyLabel}>
      {(items) => (
        <MessageMediaProvider attachments={items}>
          <div className={kind === 'media' ? 'grid grid-cols-3 gap-1.5 px-2 py-3' : 'space-y-2 px-2 py-3'}>
            {items.map((attachment) => (
              <div key={attachment.id} className="min-w-0">
                {kind === 'media' ? (
                  <MediaThumb attachment={attachment} />
                ) : (
                  <div className="rounded-lg bg-white/5 px-3 py-2 text-sm text-gray-200">
                    <div className="min-w-0">
                      <span className="block truncate">{attachment.filename}</span>
                      <span className="block text-xs text-gray-400">{formatBytes(attachment.sizeBytes)}</span>
                    </div>
                    <FileDownloadActions
                      url={resolveMediaUrl(attachment.url) ?? attachment.url}
                      filename={attachment.filename}
                    />
                  </div>
                )}
                {attachment.createdAt && kind === 'files' && (
                  <p className="mt-1 truncate text-xs text-gray-400">
                    {attachment.authorName ?? t('deletedUser')} &middot; {formatSmartTimestamp(attachment.createdAt)}
                  </p>
                )}
                {onJump && attachment.messageId && (
                  <button
                    type="button"
                    onClick={() => {
                      if (attachment.messageId) onJump(attachment.messageId)
                    }}
                    className="mt-1 min-h-11 text-left text-[11px] text-primary hover:underline"
                  >
                    {t('jumpToMessage')}
                  </button>
                )}
              </div>
            ))}
          </div>
        </MessageMediaProvider>
      )}
    </PagedContent>
  )
}

function MediaThumb({ attachment }: { attachment: Attachment }) {
  const { openByKey } = useMessageMedia()
  const isVideo = attachment.type === 'video'
  const src = resolveMediaUrl(attachment.thumbnailUrl ?? attachment.url) ?? attachment.url
  return (
    <div className="relative">
      <MediaPreview
        src={src}
        alt={attachment.filename}
        video={isVideo && !attachment.thumbnailUrl}
        compact
        onOpen={() => openByKey(attachment.id)}
        className="aspect-square w-full"
      />
      {isVideo && (
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-1 right-1 rounded bg-black/60 px-1 text-sm text-white"
        >
          &#9654;
        </span>
      )}
      {attachment.type === 'gif' && (
        <span className="pointer-events-none absolute bottom-1 left-1 rounded bg-black/60 px-1 text-[9px] font-bold text-white">
          GIF
        </span>
      )}
    </div>
  )
}
