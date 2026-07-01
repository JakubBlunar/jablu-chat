import type { LinkPreview } from '@chat/shared'

const YOUTUBE_PATTERNS = [
  /(?:youtube\.com\/watch\?.*v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/
]

export function extractYouTubeId(url: string): string | null {
  for (const pattern of YOUTUBE_PATTERNS) {
    const m = url.match(pattern)
    if (m?.[1]) return m[1]
  }
  return null
}

export function isGifUrl(lp: LinkPreview): boolean {
  if (lp.siteName === 'GIF') return true
  try {
    const u = new URL(lp.url)
    const path = u.pathname.toLowerCase()
    if (path.endsWith('.gif')) return true
    if (u.hostname === 'media.tenor.com') return true
    if (/^media\d*\.giphy\.com$/i.test(u.hostname)) return true
    if (u.hostname === 'i.giphy.com') return true
  } catch {
    /* invalid URL */
  }
  return false
}

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.svg'])

export function isImageUrl(lp: LinkPreview): boolean {
  if (lp.siteName === 'Image') return true
  try {
    const path = new URL(lp.url).pathname.toLowerCase()
    const ext = path.slice(path.lastIndexOf('.'))
    return IMAGE_EXTS.has(ext)
  } catch {
    /* invalid URL */
  }
  return false
}
