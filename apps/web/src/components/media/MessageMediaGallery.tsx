import type { Attachment, LinkPreview } from '@chat/shared'
import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import Lightbox, { IconButton, useLightboxState } from 'yet-another-react-lightbox'
import Counter from 'yet-another-react-lightbox/plugins/counter'
import Download from 'yet-another-react-lightbox/plugins/download'
import Fullscreen from 'yet-another-react-lightbox/plugins/fullscreen'
import Thumbnails from 'yet-another-react-lightbox/plugins/thumbnails'
import Video from 'yet-another-react-lightbox/plugins/video'
import Zoom from 'yet-another-react-lightbox/plugins/zoom'
import 'yet-another-react-lightbox/styles.css'
import 'yet-another-react-lightbox/plugins/counter.css'
import 'yet-another-react-lightbox/plugins/thumbnails.css'
import { DownloadIcon } from '@/components/chat/chatIcons'
import { useMediaDownload } from '@/hooks/useMediaDownload'
import { buildMessageMediaSlides } from './messageMediaSlides'
import { useTranslation } from 'react-i18next'
import { FileDownloadActions } from './FileDownloadActions'

function ReloadIcon() {
  return (
    <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 12-1l2 3M4 15l2 3a7 7 0 0 0 12-1" />
    </svg>
  )
}

function MediaDownloadButton({ onReload }: { onReload: () => void }) {
  const { t } = useTranslation('common')
  const { currentSlide } = useLightboxState()
  const isVideo = currentSlide?.type === 'video'
  const source = typeof currentSlide?.download === 'object' ? currentSlide.download : undefined
  const url = source?.url ?? (currentSlide?.type === 'video' ? currentSlide.sources[0]?.src : currentSlide?.src)
  let filename = source?.filename ?? 'image'
  if (!source && url) {
    try {
      filename = decodeURIComponent(new URL(url, window.location.href).pathname.split('/').pop() || 'image')
    } catch {
      filename = 'image'
    }
  }
  const { preparing, saving, failed, download } = useMediaDownload(isVideo ? undefined : url, filename)
  if (!url) return null
  const reload = (
    <button
      type="button"
      className="yarl__button min-h-11 min-w-11"
      aria-label={t('reloadPreview')}
      title={t('reloadPreview')}
      onClick={onReload}
    >
      <ReloadIcon />
    </button>
  )
  if (isVideo)
    return (
      <>
        <FileDownloadActions key={url} url={url} filename={filename} />
        {reload}
      </>
    )
  const label = t(preparing ? 'preparingDownload' : saving ? 'saving' : failed ? 'retryDownload' : 'download')
  return (
    <>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={t('openOriginal')}
        title={t('openOriginal')}
        className="flex h-12 w-12 items-center justify-center text-white"
      >
        <svg aria-hidden className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M14 3h7v7M21 3 10 14M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5" />
        </svg>
      </a>
      <IconButton
        label="Download"
        aria-label={label}
        title={label}
        icon={DownloadIcon}
        disabled={preparing || saving}
        onClick={() => {
          void download()
        }}
      />
      {reload}
    </>
  )
}

interface MessageMediaContextValue {
  /** Opens the message's media gallery at the slide for the given attachment/link-preview id. */
  openByKey: (key: string) => void
}

const MessageMediaContext = createContext<MessageMediaContextValue | null>(null)

/**
 * Consumers (AttachmentPreview, LinkPreviewCard) call `openByKey(id)` to open the
 * shared per-message lightbox at the matching slide. If no provider is present the
 * call is a safe no-op.
 */
export function useMessageMedia(): MessageMediaContextValue {
  return useContext(MessageMediaContext) ?? NOOP_CONTEXT
}

const NOOP_CONTEXT: MessageMediaContextValue = { openByKey: () => {} }

interface MessageMediaProviderProps {
  attachments?: Attachment[]
  linkPreviews?: LinkPreview[]
  children: React.ReactNode
}

export function MessageMediaProvider({ attachments, linkPreviews, children }: MessageMediaProviderProps) {
  const { t } = useTranslation('common')
  const [index, setIndex] = useState(-1)
  const [previewAttempt, setPreviewAttempt] = useState(0)

  const { slides, indexByKey } = useMemo(
    () => buildMessageMediaSlides(attachments, linkPreviews),
    [attachments, linkPreviews]
  )

  const openByKey = useCallback(
    (key: string) => {
      const i = indexByKey.get(key)
      if (i !== undefined) setIndex(i)
    },
    [indexByKey]
  )

  const value = useMemo(() => ({ openByKey }), [openByKey])

  const hasMultiple = slides.length > 1

  return (
    <MessageMediaContext.Provider value={value}>
      {children}
      <Lightbox
        key={previewAttempt}
        open={index >= 0}
        close={() => setIndex(-1)}
        index={index < 0 ? 0 : index}
        slides={slides}
        portal={{ container: { onContextMenu: (event) => event.stopPropagation() } }}
        labels={{
          Close: t('close'),
          Next: t('next'),
          Previous: t('previous'),
          Slide: t('gallerySlide'),
          Carousel: t('galleryCarousel'),
          Lightbox: t('galleryLabel'),
          'Photo gallery': t('galleryLabel'),
          '{index} of {total}': t('galleryPosition'),
          Download: t('download'),
          'Zoom in': t('zoomIn'),
          'Zoom out': t('zoomOut'),
          'Enter Fullscreen': t('enterFullscreen'),
          'Exit Fullscreen': t('exitFullscreen'),
          'Show thumbnails': t('showThumbnails'),
          'Hide thumbnails': t('hideThumbnails')
        }}
        plugins={
          hasMultiple ? [Zoom, Video, Fullscreen, Download, Counter, Thumbnails] : [Zoom, Video, Fullscreen, Download]
        }
        render={{
          buttonDownload: () => <MediaDownloadButton onReload={() => setPreviewAttempt((attempt) => attempt + 1)} />,
          iconError: () => (
            <span
              role="img"
              aria-label={t('galleryPreviewFailed')}
              title={t('galleryPreviewFailed')}
              className="text-red-300"
            >
              <svg
                aria-hidden
                className="h-8 w-8"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path d="m12 3 10 18H2L12 3zM12 9v5M12 17v1" />
              </svg>
            </span>
          )
        }}
        on={{ view: ({ index }) => setIndex(index) }}
        carousel={{ finite: !hasMultiple }}
        controller={{ closeOnBackdropClick: true }}
        zoom={{ maxZoomPixelRatio: 3 }}
        video={{ autoPlay: true }}
        counter={{ container: { style: { top: 'unset', bottom: 0 } } }}
        styles={{ container: { backgroundColor: 'rgba(0, 0, 0, 0.8)' } }}
      />
    </MessageMediaContext.Provider>
  )
}
