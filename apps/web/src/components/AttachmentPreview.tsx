import type { Attachment } from '@chat/shared'
import { memo } from 'react'
import { resolveMediaUrl } from '@/lib/api'
import { useMessageMedia } from '@/components/media/MessageMediaGallery'
import { CollapsiblePreview } from '@/components/media/CollapsiblePreview'
import { MediaPreview } from '@/components/media/MediaPreview'
import { FileDownloadActions } from '@/components/media/FileDownloadActions'
import { formatBytes } from '@/lib/format-bytes'

interface AttachmentPreviewProps {
  attachment: Attachment
}

function constrainedDims(w: number | null, h: number | null, maxW = 448, maxH = 300) {
  if (!w || !h) return null
  const scale = Math.min(maxW / w, maxH / h, 1)
  return { width: Math.round(w * scale), height: Math.round(h * scale) }
}

export const AttachmentPreview = memo(function AttachmentPreview({ attachment }: AttachmentPreviewProps) {
  const content = <AttachmentContents attachment={attachment} />
  return ['image', 'gif', 'video'].includes(attachment.type) ? (
    <CollapsiblePreview title={attachment.filename}>{content}</CollapsiblePreview>
  ) : (
    content
  )
})

function AttachmentContents({ attachment }: AttachmentPreviewProps) {
  const { openByKey } = useMessageMedia()
  const { width: aw, height: ah } = attachment

  if (attachment.type === 'image' || attachment.type === 'gif') {
    const dims = constrainedDims(aw, ah)
    const original = resolveMediaUrl(attachment.url) ?? attachment.url
    const legacyMayAnimate = attachment.thumbnailWidth == null && ['image/webp', 'image/avif'].includes(attachment.mimeType)
    const preview = attachment.type === 'image' && !legacyMayAnimate && attachment.thumbnailUrl ? resolveMediaUrl(attachment.thumbnailUrl) : undefined
    // Old uploads have 400px thumbnails; newer uploads carry their actual preview dimensions.
    const legacyDims = aw && ah ? constrainedDims(aw, ah, 400, 400) : null
    const previewWidth = attachment.thumbnailWidth ?? legacyDims?.width
    const srcSet = preview && aw && previewWidth && previewWidth < aw
      ? `${preview} ${previewWidth}w, ${original} ${aw}w` : undefined
    return (
      <MediaPreview
        src={preview ?? original}
        srcSet={srcSet}
        sizes={srcSet ? `(max-width: 480px) calc(100vw - 72px), ${dims?.width ?? 448}px` : undefined}
        originalSrc={original}
        alt={attachment.filename}
        className="mt-1"
        style={{
          width: dims?.width ?? 448,
          maxWidth: '100%',
          aspectRatio: dims ? `${dims.width} / ${dims.height}` : '3 / 2'
        }}
        onOpen={() => openByKey(attachment.id)}
      />
    )
  }

  if (attachment.type === 'video') {
    const vDims = constrainedDims(aw, ah)
    return (
      <div className="mt-1" style={{ width: vDims?.width ?? 448, maxWidth: '100%' }}>
        <MediaPreview
          src={resolveMediaUrl(attachment.url) ?? attachment.url}
          alt={attachment.filename}
          video
          controls
          onOpen={() => openByKey(attachment.id)}
          style={{ width: '100%', aspectRatio: vDims ? `${vDims.width} / ${vDims.height}` : '16 / 9' }}
        />
        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-gray-500">
          <span className="truncate">{attachment.filename}</span>
          <span className="shrink-0">({formatBytes(attachment.sizeBytes)})</span>
        </p>
      </div>
    )
  }

  return (
    <div className="mt-1 flex items-center gap-3 rounded-lg bg-surface-dark px-3 py-2 ring-1 ring-white/10">
      <FileIcon />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-gray-200">{attachment.filename}</p>
        <p className="text-xs text-gray-500">{formatBytes(attachment.sizeBytes)}</p>
        <FileDownloadActions url={resolveMediaUrl(attachment.url) ?? attachment.url} filename={attachment.filename} />
      </div>
    </div>
  )
}

function FileIcon() {
  return (
    <svg
      className="h-8 w-8 shrink-0 text-gray-400"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  )
}
