import type { Attachment } from '@chat/shared'
import { memo, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

interface AttachmentPreviewProps {
  attachment: Attachment
}

function LightboxOverlay({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return createPortal(
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/80" role="dialog" aria-modal="true" onClick={onClose}>
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute right-4 top-4 rounded-full bg-black/50 p-2 text-white transition hover:bg-black/70"
        style={{ marginTop: 'env(safe-area-inset-top, 0px)', marginRight: 'env(safe-area-inset-right, 0px)' }}
      >
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path d="M6 18 18 6M6 6l12 12" />
        </svg>
      </button>
      <div onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>,
    document.body
  )
}

function constrainedDims(w: number | null, h: number | null, maxW = 448, maxH = 300) {
  if (!w || !h) return null
  const scale = Math.min(maxW / w, maxH / h, 1)
  return { width: Math.round(w * scale), height: Math.round(h * scale) }
}

export const AttachmentPreview = memo(function AttachmentPreview({ attachment }: AttachmentPreviewProps) {
  const [lightbox, setLightbox] = useState(false)
  const { width: aw, height: ah } = attachment

  if (attachment.type === 'image' || attachment.type === 'gif') {
    const dims = constrainedDims(aw, ah)
    return (
      <>
        <button
          type="button"
          className="mt-1 block overflow-hidden rounded-lg"
          style={dims ? { width: dims.width, maxWidth: '100%', aspectRatio: `${dims.width} / ${dims.height}` } : undefined}
          onClick={() => setLightbox(true)}
        >
          <img
            src={attachment.url}
            alt={attachment.filename}
            width={dims?.width}
            height={dims?.height}
            className="h-full w-full rounded-lg object-contain"
            loading="lazy"
          />
        </button>
        {lightbox && (
          <LightboxOverlay onClose={() => setLightbox(false)}>
            <img
              src={attachment.url}
              alt={attachment.filename}
              className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain"
            />
          </LightboxOverlay>
        )}
      </>
    )
  }

  if (attachment.type === 'video') {
    const vDims = constrainedDims(aw, ah)
    return (
      <div className="mt-1" style={vDims ? { width: vDims.width, maxWidth: '100%' } : { maxWidth: 448 }}>
        <video
          src={attachment.url}
          controls
          preload="metadata"
          style={vDims ? { width: '100%', aspectRatio: `${vDims.width} / ${vDims.height}` } : { aspectRatio: '16 / 9', width: '100%' }}
          className="rounded-lg"
        >
          <track kind="captions" />
        </video>
        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-gray-500">
          <span className="truncate">{attachment.filename}</span>
          <span className="shrink-0">({formatBytes(attachment.sizeBytes)})</span>
        </p>
      </div>
    )
  }

  return (
    <a
      href={attachment.url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-1 flex items-center gap-3 rounded-lg bg-surface-dark px-3 py-2 ring-1 ring-white/10 transition hover:bg-surface-hover"
    >
      <FileIcon />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-blue-400 hover:underline">{attachment.filename}</p>
        <p className="text-xs text-gray-500">{formatBytes(attachment.sizeBytes)}</p>
      </div>
      <DownloadIcon />
    </a>
  )
})

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
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

function DownloadIcon() {
  return (
    <svg
      className="h-5 w-5 shrink-0 text-gray-400"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}
