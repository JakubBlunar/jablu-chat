import { Injectable, Logger } from '@nestjs/common'
import { lookup } from 'dns/promises'
import { PrismaService } from '../prisma/prisma.service'
import { detectCharset, extractUrls, OgMeta, parseOgTags } from './link-preview-parse'

const FETCH_TIMEOUT = 8000
const MAX_REDIRECTS = 5
/**
 * Reading stops at </head>, which for most sites is a few kilobytes. The cap
 * only matters for pages that bury their metadata behind an enormous head --
 * YouTube puts og:title around 690 KB in -- so it stays generous.
 */
const MAX_RESPONSE_BYTES = 1536 * 1024
const SUCCESS_TTL_MS = 30 * 60 * 1000
const FAILURE_TTL_MS = 5 * 60 * 1000
const CACHE_LIMIT = 500
const USER_AGENT = 'Mozilla/5.0 (compatible; ChatBot/1.0; +link-preview)'
const ACCEPT = 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8'

const previewSelect = {
  id: true,
  url: true,
  title: true,
  description: true,
  imageUrl: true,
  siteName: true
} as const

export type GeneratedPreview = {
  id: string
  url: string
  title: string | null
  description: string | null
  imageUrl: string | null
  siteName: string | null
}

type PreviewInput = OgMeta & { messageId: string; url: string }

type CacheEntry = { meta: OgMeta | null; expiresAt: number }

function isPrivateIp(ip: string): boolean {
  // IPv4-mapped IPv6 (::ffff:x.x.x.x)
  const v4match = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)
  const addr = v4match ? v4match[1] : ip

  if (addr.includes(':')) {
    // IPv6
    const lower = addr.toLowerCase()
    if (lower === '::' || lower === '::1') return true
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true // fc00::/7
    if (lower.startsWith('fe80')) return true // fe80::/10
    return false
  }

  const parts = addr.split('.').map(Number)
  if (parts.length !== 4 || parts.some((p) => isNaN(p))) return false
  const [a, b] = parts
  if (a === 0) return true
  if (a === 10) return true
  if (a === 127) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  return false
}

/**
 * Releases a response we are not going to read. Undici keeps the socket
 * checked out until the body is consumed or cancelled, so skipping this leaks
 * a connection for every redirect hop and every rejected response.
 */
async function discardBody(res: Response): Promise<void> {
  try {
    await res.body?.cancel()
  } catch {
    // Body already closed or errored; nothing to release.
  }
}

/**
 * Reads until the closing </head> tag or the byte cap, whichever comes first.
 * Metadata lives in the head, so this usually costs a few kilobytes instead of
 * the whole page.
 */
async function readHead(res: Response, limit: number): Promise<Buffer> {
  if (!res.body) return Buffer.alloc(0)
  const reader = (res.body as unknown as { getReader(): ReadableStreamDefaultReader<Uint8Array> }).getReader()
  const chunks: Buffer[] = []
  let total = 0
  let carry = ''

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done || !value) break
      const chunk = Buffer.from(value)
      chunks.push(chunk)
      total += chunk.length
      // Scanning the new bytes with a small overlap avoids re-reading
      // everything received so far on each chunk.
      const window = carry + chunk.toString('latin1')
      if (/<\/head\s*>/i.test(window)) break
      if (total >= limit) break
      carry = window.slice(-16)
    }
  } finally {
    await reader.cancel().catch(() => {})
  }

  return Buffer.concat(chunks)
}

function decodeHtml(bytes: Buffer, contentType: string): string {
  const charset = detectCharset(contentType, bytes.subarray(0, 2048).toString('latin1'))
  if (charset === 'utf-8' || charset === 'utf8') return bytes.toString('utf8')
  try {
    return new TextDecoder(charset).decode(bytes)
  } catch {
    return bytes.toString('utf8')
  }
}

@Injectable()
export class LinkPreviewService {
  private readonly logger = new Logger(LinkPreviewService.name)
  private readonly metaCache = new Map<string, CacheEntry>()
  private readonly inFlight = new Map<string, Promise<OgMeta | null>>()

  constructor(private readonly prisma: PrismaService) {}

  extractUrls(content: string | null): string[] {
    return extractUrls(content)
  }

  async generatePreviews(messageId: string, content: string | null): Promise<GeneratedPreview[]> {
    const urls = this.extractUrls(content)
    if (urls.length === 0) return []

    // Fetched together: one slow or unreachable site no longer delays, or eats
    // the budget of, the links after it.
    const resolved = await Promise.all(urls.map((url) => this.describeUrl(messageId, url)))
    const data = resolved.filter((preview): preview is PreviewInput => preview !== null)
    if (data.length === 0) return []

    try {
      return await this.prisma.linkPreview.createManyAndReturn({ data, select: previewSelect })
    } catch (e) {
      this.logger.warn(`Failed to persist previews for message ${messageId}: ${e}`)
      return []
    }
  }

  private async describeUrl(messageId: string, url: string): Promise<PreviewInput | null> {
    if (this.isGifUrl(url)) {
      return { messageId, url, title: 'GIF', description: null, imageUrl: url, siteName: 'GIF' }
    }
    if (this.isImageUrl(url)) {
      return { messageId, url, title: 'Image', description: null, imageUrl: url, siteName: 'Image' }
    }

    const meta = await this.resolveMeta(url)
    if (!meta || (!meta.title && !meta.description)) return null
    return { messageId, url, ...meta }
  }

  /**
   * Caches per URL and shares in-flight requests, so the same link pasted
   * repeatedly (or to several channels at once) is fetched once.
   */
  private async resolveMeta(url: string): Promise<OgMeta | null> {
    const cached = this.metaCache.get(url)
    if (cached && cached.expiresAt > Date.now()) return cached.meta

    const existing = this.inFlight.get(url)
    if (existing) return existing

    const pending = this.fetchOgMeta(url)
      .catch((e) => {
        this.logger.warn(`Failed to fetch OG for ${url}: ${e}`)
        return null
      })
      .then((meta) => {
        this.rememberMeta(url, meta)
        this.inFlight.delete(url)
        return meta
      })

    this.inFlight.set(url, pending)
    return pending
  }

  private rememberMeta(url: string, meta: OgMeta | null): void {
    this.metaCache.delete(url)
    if (this.metaCache.size >= CACHE_LIMIT) {
      const oldest = this.metaCache.keys().next()
      if (!oldest.done) this.metaCache.delete(oldest.value)
    }
    this.metaCache.set(url, { meta, expiresAt: Date.now() + (meta ? SUCCESS_TTL_MS : FAILURE_TTL_MS) })
  }

  private isGifUrl(url: string): boolean {
    try {
      const u = new URL(url)
      const path = u.pathname.toLowerCase()
      if (path.endsWith('.gif')) return true
      if (u.hostname === 'media.tenor.com' && /\.(gif|mp4)$/i.test(path)) return true
      if (/^media\d*\.giphy\.com$/i.test(u.hostname)) return true
      return u.hostname === 'i.giphy.com'
    } catch {
      return false
    }
  }

  private static readonly IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.svg'])

  private isImageUrl(url: string): boolean {
    try {
      const path = new URL(url).pathname.toLowerCase()
      const dot = path.lastIndexOf('.')
      return dot !== -1 && LinkPreviewService.IMAGE_EXTS.has(path.slice(dot))
    } catch {
      return false
    }
  }

  private async isSafeUrl(url: string): Promise<boolean> {
    try {
      const { hostname } = new URL(url)
      const addresses = await lookup(hostname, { all: true })
      return addresses.length > 0 && addresses.every(({ address }) => !isPrivateIp(address))
    } catch {
      return false
    }
  }

  private async fetchWithSafeRedirects(
    url: string,
    signal: AbortSignal
  ): Promise<{ response: Response; finalUrl: string } | null> {
    let current = url
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      if (!(await this.isSafeUrl(current))) return null

      const response = await fetch(current, {
        signal,
        headers: { 'User-Agent': USER_AGENT, Accept: ACCEPT, 'Accept-Language': 'en-US,en;q=0.9' },
        redirect: 'manual'
      })

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location')
        await discardBody(response)
        if (!location) return null
        try {
          current = new URL(location, current).href
        } catch {
          return null
        }
        continue
      }

      return { response, finalUrl: current }
    }
    return null
  }

  private async fetchOgMeta(url: string): Promise<OgMeta | null> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT)

    try {
      const hop = await this.fetchWithSafeRedirects(url, controller.signal)
      if (!hop) return null

      const { response, finalUrl } = hop
      if (!response.ok) {
        await discardBody(response)
        return null
      }

      const contentType = response.headers.get('content-type') ?? ''
      if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) {
        await discardBody(response)
        return null
      }

      const html = decodeHtml(await readHead(response, MAX_RESPONSE_BYTES), contentType)
      return parseOgTags(html, finalUrl)
    } finally {
      clearTimeout(timeout)
    }
  }
}
