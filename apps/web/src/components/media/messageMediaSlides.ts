import type { Attachment, LinkPreview } from '@chat/shared'
import type { Slide } from 'yet-another-react-lightbox'
import { resolveMediaUrl } from '@/lib/api'
import { extractYouTubeId, isGifUrl, isImageUrl } from '@/lib/mediaUrl'

export interface BuiltMessageMedia {
  slides: Slide[]
  /** Maps an attachment id / link-preview id to its slide index. */
  indexByKey: Map<string, number>
}

/**
 * Builds an ordered list of lightbox slides for a single message, drawn only from
 * that message's uploaded attachments (image/gif/video) and linked raw images/GIFs.
 * YouTube embeds, default link cards, bot embeds, and file attachments are excluded.
 *
 * Order matches the on-screen render order: attachments first, then linked images.
 */
export function buildMessageMediaSlides(
  attachments: Attachment[] = [],
  linkPreviews: LinkPreview[] = []
): BuiltMessageMedia {
  const slides: Slide[] = []
  const indexByKey = new Map<string, number>()

  for (const att of attachments) {
    if (att.type === 'image' || att.type === 'gif') {
      indexByKey.set(att.id, slides.length)
      slides.push({
        type: 'image',
        src: resolveMediaUrl(att.url) ?? att.url,
        alt: att.filename,
        ...(att.width ? { width: att.width } : {}),
        ...(att.height ? { height: att.height } : {})
      })
    } else if (att.type === 'video') {
      indexByKey.set(att.id, slides.length)
      slides.push({
        type: 'video',
        ...(att.width ? { width: att.width } : {}),
        ...(att.height ? { height: att.height } : {}),
        ...(att.thumbnailUrl ? { poster: resolveMediaUrl(att.thumbnailUrl) } : {}),
        sources: [{ src: resolveMediaUrl(att.url) ?? att.url, type: att.mimeType }]
      })
    }
    // 'file' attachments are not viewable media and are excluded.
  }

  for (const lp of linkPreviews) {
    // Mirror LinkPreviewCard routing: YouTube is handled as an embed, not a slide.
    if (extractYouTubeId(lp.url)) continue
    if (isImageUrl(lp) || isGifUrl(lp)) {
      const src = lp.imageUrl ?? lp.url
      indexByKey.set(lp.id, slides.length)
      slides.push({
        type: 'image',
        src: resolveMediaUrl(src) ?? src,
        ...(lp.title ? { alt: lp.title } : {})
      })
    }
  }

  return { slides, indexByKey }
}
