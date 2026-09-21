/**
 * Splits a markdown message into a flat stream of tokens so that only natural
 * language reaches the machine-translation engine and everything functional
 * passes through byte-for-byte.
 *
 * Why token-streams and not "placeholders in the text": we verified against a
 * live LibreTranslate that the engine rewrites inline tokens unpredictably —
 * "[[1]]", "{{0}}" and even bare digit runs get mangled — and that raw code /
 * URLs are corrupted (code fences lose their backticks, URLs get spaces
 * inserted, mentions like @user get broken apart). So instead the
 * non-translatable pieces are pulled *out of* the text entirely, only the
 * natural-language tokens are sent (as one batch), and the original pieces are
 * spliced back in place. The token list IS the reassembly: joining `.s` across
 * all tokens reproduces the message, with each text token optionally swapped
 * for its translation.
 *
 * Protected verbatim (never sent to the engine):
 *   - fenced code blocks (``` / ~~~, any indent, any info string)
 *   - inline code spans (`...`)
 *   - markdown links `[text](url)` — only the link *text* is translated
 *   - bare URLs (http/https)
 *   - mentions (@user, @[Full Name], @here, @everyone)
 *
 * Sent as text (in full sentence context — the engine handles inline emphasis
 * well, and fragmenting to protect it measurably degrades translation quality):
 *   - **bold**, __bold__, *italic*, _italic_, ~~strike~~, ||spoiler||,
 *     snake_case identifiers, tables, and plain prose.
 *
 * The round-trip guarantee: reassemble(tokenize(x)) === x always holds,
 * regardless of what the engine returns, so a message can never be corrupted.
 */

export type SegToken = { t: 'text'; s: string } | { t: 'keep'; s: string }

const FENCE_OPEN = /^\s{0,3}(`{3,}|~{3,})/

/**
 * One inline protectable unit — inline code, markdown link, URL, or mention.
 * Order in the alternation decides ownership: code first, then links (before
 * bare URLs so `[text](url)` wins), then URLs, then mentions.
 */
const INLINE_RE =
  /(`[^`\n]*`)|(\[[^\]\n]{0,300}\]\((?:https?:\/\/)?[^\s)]+\))|(https?:\/\/[^\s<>"')\]]+)|(@(?:here|everyone|\[?[^\]\n]{1,40}\]?))\b/g

/** Leading block marker: list bullet, blockquote, or heading prefix. */
const LEADING_MARKER_RE = /^(\s*(?:[-*+]|\d{1,9}\.)\s+|>+\s+|#{1,6}\s+)/

/**
 * Tokenize one plain line (no code fences) into text/keep tokens. Empty text
 * runs are dropped; adjacent keeps are merged.
 */
export function tokenizeLine(line: string): SegToken[] {
  const tokens: SegToken[] = []
  const pushText = (s: string) => {
    if (s) tokens.push({ t: 'text', s })
  }
  const pushKeep = (s: string) => {
    if (!s) return
    const last = tokens[tokens.length - 1]
    if (last && last.t === 'keep') last.s += s
    else tokens.push({ t: 'keep', s })
  }

  let rest = line
  const marker = rest.match(LEADING_MARKER_RE)
  if (marker) {
    pushKeep(marker[1])
    rest = rest.slice(marker[0].length)
  }

  INLINE_RE.lastIndex = 0
  let pos = 0
  let m: RegExpExecArray | null
  while ((m = INLINE_RE.exec(rest)) !== null) {
    if (m.index > pos) pushText(rest.slice(pos, m.index))
    const token = m[0]
    if (m[2]) {
      // Markdown link `[text](url)` — translate the text, keep brackets + URL.
      const link = token.match(/^\[([^\]\n]{0,300})\](\([^)]*\))$/)
      if (link) {
        pushKeep('[')
        pushText(link[1])
        pushKeep(']' + link[2])
      } else {
        pushKeep(token)
      }
    } else {
      // Inline code, bare URL, or mention — opaque, kept verbatim.
      pushKeep(token)
    }
    pos = INLINE_RE.lastIndex
  }
  pushText(rest.slice(pos))

  if (tokens.length === 0) tokens.push({ t: 'text', s: line })
  return tokens
}

/**
 * Tokenize whole message content. Returns a flat token list; joining `.s`
 * across all tokens reproduces the input exactly.
 */
export function tokenize(content: string): SegToken[] {
  const tokens: SegToken[] = []
  const pushKeep = (s: string) => {
    if (!s) return
    const last = tokens[tokens.length - 1]
    if (last && last.t === 'keep') last.s += s
    else tokens.push({ t: 'keep', s })
  }

  const lines = content.split('\n')
  let inFence = false
  let fenceChar = ''
  let fenceLen = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (inFence) {
      pushKeep(line)
      const close = line.match(/^\s*(`+|~+)\s*$/)
      if (close && close[1][0] === fenceChar && close[1].length >= fenceLen) inFence = false
    } else {
      const m = line.match(FENCE_OPEN)
      if (m) {
        pushKeep(line)
        inFence = true
        fenceChar = m[1][0]
        fenceLen = m[1].length
      } else {
        for (const tok of tokenizeLine(line)) {
          if (tok.t === 'keep') pushKeep(tok.s)
          else tokens.push({ t: 'text', s: tok.s })
        }
      }
    }
    if (i < lines.length - 1) pushKeep('\n')
  }

  return tokens
}

/** The text tokens, in order — the batch to send to the translation engine. */
export function textSegments(tokens: SegToken[]): string[] {
  return tokens.filter((t): t is Extract<SegToken, { t: 'text' }> => t.t === 'text').map((t) => t.s)
}

/**
 * Join tokens back into a string, swapping each text token for its
 * translation (falls back to the original text when a translation is missing
 * or empty). translations must be index-aligned with textSegments(tokens) —
 * the LT batch API preserves that 1:1 alignment.
 */
export function reassemble(tokens: SegToken[], translations?: (string | null | undefined)[]): string {
  let textIdx = 0
  return tokens
    .map((tok) => {
      if (tok.t === 'keep') return tok.s
      const tr = translations?.[textIdx]
      textIdx++
      return tr && tr.length > 0 ? tr : tok.s
    })
    .join('')
}

/** Convenience: round-trip guarantee used by tests. */
export function isRoundTripStable(content: string): boolean {
  const tokens = tokenize(content)
  return reassemble(tokens) === content
}
