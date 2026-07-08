import type { Attachment } from '@chat/shared'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import SimpleBar from 'simplebar-react'
import { api, resolveMediaUrl } from '@/lib/api'
import { MessageMediaProvider, useMessageMedia } from '@/components/media/MessageMediaGallery'
import { AttachmentsPager } from './AttachmentsPager'

const PAGE_SIZE = 30

interface ChannelMediaGridProps {
  serverId: string
  channelId: string
}

export function ChannelMediaGrid({ serverId, channelId }: ChannelMediaGridProps) {
  const { t } = useTranslation('common')
  const [page, setPage] = useState(0)
  const [items, setItems] = useState<Attachment[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setPage(0)
  }, [channelId])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api
      .getChannelAttachments(serverId, channelId, 'media', page, PAGE_SIZE)
      .then((data) => {
        if (cancelled) return
        setItems(data.items)
        setTotal(data.total)
      })
      .catch(() => {
        if (cancelled) return
        setItems([])
        setTotal(0)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [serverId, channelId, page])

  if (loading && items.length === 0) {
    return <div className="flex h-full items-center justify-center px-3 py-8 text-center text-sm text-gray-500">{t('loading')}</div>
  }

  if (!loading && total === 0) {
    return <div className="flex h-full items-center justify-center px-3 py-8 text-center text-sm text-gray-500">{t('channelMediaEmpty')}</div>
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <SimpleBar className="min-h-0 flex-1" style={{ maxHeight: '100%' }}>
        <MessageMediaProvider attachments={items}>
          <div className="grid grid-cols-3 gap-1.5 px-2 py-3">
            {items.map((att) => (
              <MediaThumb key={att.id} attachment={att} />
            ))}
          </div>
        </MessageMediaProvider>
      </SimpleBar>
      <AttachmentsPager
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        onPrev={() => setPage((p) => Math.max(0, p - 1))}
        onNext={() => setPage((p) => p + 1)}
      />
    </div>
  )
}

function MediaThumb({ attachment }: { attachment: Attachment }) {
  const { openByKey } = useMessageMedia()
  const isVideo = attachment.type === 'video'
  const thumbSrc = resolveMediaUrl(attachment.thumbnailUrl ?? attachment.url) ?? attachment.url

  return (
    <button
      type="button"
      onClick={() => openByKey(attachment.id)}
      className="group relative aspect-square overflow-hidden rounded-md bg-black/30"
    >
      {isVideo && !attachment.thumbnailUrl ? (
        <video
          src={`${resolveMediaUrl(attachment.url) ?? attachment.url}#t=0.1`}
          muted
          preload="metadata"
          className="h-full w-full object-cover"
        />
      ) : (
        <img
          src={thumbSrc}
          alt={attachment.filename}
          loading="lazy"
          className="h-full w-full object-cover transition group-hover:opacity-90"
        />
      )}
      {isVideo && (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white">
            <PlayIcon />
          </span>
        </span>
      )}
      {attachment.type === 'gif' && (
        <span className="pointer-events-none absolute bottom-1 left-1 rounded bg-black/60 px-1 text-[9px] font-bold uppercase leading-tight text-white">
          GIF
        </span>
      )}
    </button>
  )
}

function PlayIcon() {
  return (
    <svg className="h-4 w-4 translate-x-[1px]" viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5v14l11-7z" />
    </svg>
  )
}
