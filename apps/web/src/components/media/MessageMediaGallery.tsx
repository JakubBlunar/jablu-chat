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

function MediaDownloadButton() {
  const { t } = useTranslation('common')
  const { currentSlide } = useLightboxState()
  const image = currentSlide?.type === undefined || currentSlide?.type === 'image' ? currentSlide : undefined
  const source = typeof image?.download === 'object' ? image.download : undefined
  const url = source?.url ?? image?.src
  let filename = source?.filename ?? 'image'
  if (!source && url) {
    try {
      filename = decodeURIComponent(new URL(url, window.location.href).pathname.split('/').pop() || 'image')
    } catch {
      filename = 'image'
    }
  }
  const { preparing, saving, failed, download } = useMediaDownload(url, filename)
  if (!image) return null
  const label = t(preparing ? 'preparingDownload' : saving ? 'saving' : failed ? 'retryDownload' : 'download')
  return (
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
        open={index >= 0}
        close={() => setIndex(-1)}
        index={index < 0 ? 0 : index}
        slides={slides}
        labels={{
          Close: t('close'),
          Next: t('next'),
          Previous: t('previous'),
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
        render={{ buttonDownload: () => <MediaDownloadButton /> }}
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
