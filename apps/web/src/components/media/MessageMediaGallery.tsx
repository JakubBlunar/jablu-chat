import type { Attachment, LinkPreview } from '@chat/shared'
import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import Lightbox from 'yet-another-react-lightbox'
import Counter from 'yet-another-react-lightbox/plugins/counter'
import Fullscreen from 'yet-another-react-lightbox/plugins/fullscreen'
import Thumbnails from 'yet-another-react-lightbox/plugins/thumbnails'
import Video from 'yet-another-react-lightbox/plugins/video'
import Zoom from 'yet-another-react-lightbox/plugins/zoom'
import 'yet-another-react-lightbox/styles.css'
import 'yet-another-react-lightbox/plugins/counter.css'
import 'yet-another-react-lightbox/plugins/thumbnails.css'
import { buildMessageMediaSlides } from './messageMediaSlides'

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
        plugins={hasMultiple ? [Zoom, Video, Fullscreen, Counter, Thumbnails] : [Zoom, Video, Fullscreen]}
        carousel={{ finite: !hasMultiple }}
        controller={{ closeOnBackdropClick: true }}
        zoom={{ maxZoomPixelRatio: 3 }}
        video={{ autoPlay: true }}
        counter={{ container: { style: { top: 'unset', bottom: 0 } } }}
      />
    </MessageMediaContext.Provider>
  )
}
