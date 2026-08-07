/**
 * Pure HTML/URL parsing helpers for link previews. Kept free of IO so the
 * fiddly bits (entities, quoting, punctuation) can be tested directly.
 */

export type OgMeta = {
  title: string | null
  description: string | null
  imageUrl: string | null
  siteName: string | null
}

export const MAX_URLS_PER_MESSAGE = 5

const TITLE_MAX = 300
const DESCRIPTION_MAX = 500
const SITE_NAME_MAX = 100

const URL_CANDIDATE_RE = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi
const META_TAG_RE = /<meta\b([^>]*)>/gi
const ATTRIBUTE_RE = /([a-zA-Z_:][-\w:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g
const TITLE_TAG_RE = /<title\b[^>]*>([\s\S]*?)<\/title>/i
const HEAD_END_RE = /<\/head\s*>/i
const ENTITY_RE = /&(#[xX][0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]{1,31});/g

/** Punctuation that ends a sentence rather than a URL. */
const TRAILING_PUNCTUATION = new Set([',', '.', ';', ':', '!', '?', '"', "'", '*'])

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ensp: ' ',
  emsp: ' ',
  thinsp: ' ',
  shy: '',
  zwj: '',
  zwnj: '',
  hellip: '\u2026',
  mdash: '\u2014',
  ndash: '\u2013',
  minus: '\u2212',
  lsquo: '\u2018',
  rsquo: '\u2019',
  sbquo: '\u201a',
  ldquo: '\u201c',
  rdquo: '\u201d',
  bdquo: '\u201e',
  laquo: '\u00ab',
  raquo: '\u00bb',
  lsaquo: '\u2039',
  rsaquo: '\u203a',
  bull: '\u2022',
  middot: '\u00b7',
  dagger: '\u2020',
  Dagger: '\u2021',
  prime: '\u2032',
  Prime: '\u2033',
  copy: '\u00a9',
  reg: '\u00ae',
  trade: '\u2122',
  deg: '\u00b0',
  plusmn: '\u00b1',
  times: '\u00d7',
  divide: '\u00f7',
  frac12: '\u00bd',
  frac14: '\u00bc',
  frac34: '\u00be',
  euro: '\u20ac',
  pound: '\u00a3',
  yen: '\u00a5',
  cent: '\u00a2',
  sect: '\u00a7',
  para: '\u00b6',
  iexcl: '\u00a1',
  iquest: '\u00bf'
}

/**
 * Numeric references in the 0x80-0x9F range are, per the HTML spec, actually
 * windows-1252 bytes. Publishing tools emit these constantly (&#146; for a
 * curly apostrophe), so mapping them keeps titles from filling with U+0092.
 */
const WINDOWS_1252_OVERRIDES: Record<number, number> = {
  0x80: 0x20ac,
  0x82: 0x201a,
  0x83: 0x0192,
  0x84: 0x201e,
  0x85: 0x2026,
  0x86: 0x2020,
  0x87: 0x2021,
  0x88: 0x02c6,
  0x89: 0x2030,
  0x8a: 0x0160,
  0x8b: 0x2039,
  0x8c: 0x0152,
  0x8e: 0x017d,
  0x91: 0x2018,
  0x92: 0x2019,
  0x93: 0x201c,
  0x94: 0x201d,
  0x95: 0x2022,
  0x96: 0x2013,
  0x97: 0x2014,
  0x98: 0x02dc,
  0x99: 0x2122,
  0x9a: 0x0161,
  0x9b: 0x203a,
  0x9c: 0x0153,
  0x9e: 0x017e,
  0x9f: 0x0178
}

function codePointToString(codePoint: number): string | null {
  const mapped = WINDOWS_1252_OVERRIDES[codePoint] ?? codePoint
  if (mapped === 0 || mapped > 0x10ffff) return null
  // Lone surrogates are not valid on their own.
  if (mapped >= 0xd800 && mapped <= 0xdfff) return null
  try {
    return String.fromCodePoint(mapped)
  } catch {
    return null
  }
}

/**
 * Decodes HTML character references in a single pass, so double-encoded input
 * (`&amp;quot;`) correctly yields the literal `&quot;` rather than a quote.
 */
export function decodeHtmlEntities(input: string): string {
  if (!input.includes('&')) return input

  return input.replace(ENTITY_RE, (match, body: string) => {
    if (body[0] === '#') {
      const isHex = body[1] === 'x' || body[1] === 'X'
      const codePoint = Number.parseInt(isHex ? body.slice(2) : body.slice(1), isHex ? 16 : 10)
      if (Number.isNaN(codePoint)) return match
      return codePointToString(codePoint) ?? match
    }
    const named = NAMED_ENTITIES[body] ?? NAMED_ENTITIES[body.toLowerCase()]
    return named ?? match
  })
}

function countChar(value: string, char: string): number {
  let count = 0
  for (let i = 0; i < value.length; i++) {
    if (value[i] === char) count += 1
  }
  return count
}

/**
 * Strips characters that belong to the surrounding prose rather than the link.
 * Without this the last URL in a sentence keeps its full stop and 404s.
 */
function trimUrlTail(candidate: string): string {
  let end = candidate.length
  while (end > 0) {
    const char = candidate[end - 1]
    if (TRAILING_PUNCTUATION.has(char)) {
      end -= 1
      continue
    }
    // A closing paren is only part of the URL when something opened it inside
    // the URL, otherwise it closes prose like "(see https://example.com/a)".
    if (char === ')') {
      const head = candidate.slice(0, end)
      if (countChar(head, ')') > countChar(head, '(')) {
        end -= 1
        continue
      }
    }
    break
  }
  return candidate.slice(0, end)
}

export function extractUrls(content: string | null, limit = MAX_URLS_PER_MESSAGE): string[] {
  if (!content) return []
  const candidates = content.match(URL_CANDIDATE_RE)
  if (!candidates) return []

  const seen = new Set<string>()
  const urls: string[] = []

  for (const candidate of candidates) {
    const url = trimUrlTail(candidate)
    if (!url || seen.has(url)) continue
    try {
      const parsed = new URL(url)
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') continue
    } catch {
      continue
    }
    seen.add(url)
    urls.push(url)
    if (urls.length >= limit) break
  }

  return urls
}

function readAttributes(source: string): Map<string, string> {
  const attributes = new Map<string, string>()
  ATTRIBUTE_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = ATTRIBUTE_RE.exec(source)) !== null) {
    const name = match[1].toLowerCase()
    if (!attributes.has(name)) attributes.set(name, match[2] ?? match[3] ?? match[4] ?? '')
  }
  return attributes
}

/**
 * Collects every meta tag in one sweep. The previous implementation ran four
 * regexes per property over the whole document, which meant ~24 full scans of
 * a megabyte of HTML for a single preview.
 */
function collectMetaTags(html: string): Map<string, string> {
  const tags = new Map<string, string>()
  META_TAG_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = META_TAG_RE.exec(html)) !== null) {
    const attributes = readAttributes(match[1])
    const key = attributes.get('property') ?? attributes.get('name') ?? attributes.get('itemprop')
    const content = attributes.get('content')
    if (!key || content === undefined) continue
    const normalized = key.trim().toLowerCase()
    if (!tags.has(normalized)) tags.set(normalized, content)
  }
  return tags
}

function clean(value: string | undefined, maxLength: number): string | null {
  if (!value) return null
  const text = decodeHtmlEntities(value).replace(/\s+/g, ' ').trim()
  if (!text) return null
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength - 1).trimEnd()}\u2026`
}

function resolveImageUrl(value: string | undefined, baseUrl: string): string | null {
  if (!value) return null
  const raw = decodeHtmlEntities(value).trim()
  if (!raw) return null
  try {
    const resolved = new URL(raw, baseUrl)
    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') return null
    return resolved.href
  } catch {
    return null
  }
}

const TITLE_KEYS = ['og:title', 'twitter:title']
const DESCRIPTION_KEYS = ['og:description', 'twitter:description', 'description']
const IMAGE_KEYS = ['og:image', 'og:image:url', 'og:image:secure_url', 'twitter:image', 'twitter:image:src']
const SITE_NAME_KEYS = ['og:site_name', 'application-name']

function hasPreviewTags(tags: Map<string, string>): boolean {
  return [...TITLE_KEYS, ...DESCRIPTION_KEYS, ...IMAGE_KEYS, ...SITE_NAME_KEYS].some((key) => tags.get(key))
}

export function parseOgTags(html: string, baseUrl: string): OgMeta {
  const headEnd = html.search(HEAD_END_RE)
  const head = headEnd === -1 ? html : html.slice(0, headEnd)

  let tags = collectMetaTags(head)
  // A few sites emit their OG block after </head>; only pay for the full
  // document scan when the head turned up nothing usable.
  if (headEnd !== -1 && !hasPreviewTags(tags)) {
    const whole = collectMetaTags(html)
    if (hasPreviewTags(whole)) tags = whole
  }

  const pick = (keys: string[]): string | undefined => {
    for (const key of keys) {
      const value = tags.get(key)
      if (value) return value
    }
    return undefined
  }

  let title = clean(pick(TITLE_KEYS), TITLE_MAX)
  if (!title) title = clean(head.match(TITLE_TAG_RE)?.[1], TITLE_MAX)

  return {
    title,
    description: clean(pick(DESCRIPTION_KEYS), DESCRIPTION_MAX),
    imageUrl: resolveImageUrl(pick(IMAGE_KEYS), baseUrl),
    siteName: clean(pick(SITE_NAME_KEYS), SITE_NAME_MAX)
  }
}

export function detectCharset(contentType: string, htmlStart: string): string {
  const fromHeader = /charset\s*=\s*["']?([\w-]+)/i.exec(contentType)?.[1]
  if (fromHeader) return fromHeader.toLowerCase()
  const fromMeta = /<meta[^>]+charset\s*=\s*["']?([\w-]+)/i.exec(htmlStart)?.[1]
  if (fromMeta) return fromMeta.toLowerCase()
  return 'utf-8'
}
