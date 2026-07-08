import type { Attachment } from '@chat/shared'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import SimpleBar from 'simplebar-react'
import { api, resolveMediaUrl } from '@/lib/api'
import { AttachmentsPager } from './AttachmentsPager'

const PAGE_SIZE = 30

interface ChannelFilesListProps {
  serverId: string
  channelId: string
}

export function ChannelFilesList({ serverId, channelId }: ChannelFilesListProps) {
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
      .getChannelAttachments(serverId, channelId, 'files', page, PAGE_SIZE)
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
    return <div className="flex h-full items-center justify-center px-3 py-8 text-center text-sm text-gray-500">{t('channelFilesEmpty')}</div>
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <SimpleBar className="min-h-0 flex-1" style={{ maxHeight: '100%' }}>
        <div className="flex flex-col gap-1.5 px-2 py-3">
          {items.map((att) => (
            <a
              key={att.id}
              href={resolveMediaUrl(att.url)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-lg bg-surface-dark px-3 py-2 ring-1 ring-white/10 transition hover:bg-surface-hover"
            >
              <FileIcon />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-blue-400 hover:underline">{att.filename}</p>
                <p className="text-xs text-gray-500">{formatBytes(att.sizeBytes)}</p>
              </div>
              <DownloadIcon />
            </a>
          ))}
        </div>
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

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function FileIcon() {
  return (
    <svg className="h-8 w-8 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  )
}

function DownloadIcon() {
  return (
    <svg className="h-5 w-5 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}
