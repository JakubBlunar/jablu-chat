import { decodeHtmlEntities, detectCharset, extractUrls, parseOgTags } from './link-preview-parse'

describe('extractUrls', () => {
  it('extracts URLs from content', () => {
    const urls = extractUrls('Check out https://example.com and http://foo.bar/path?q=1')
    expect(urls).toEqual(['https://example.com', 'http://foo.bar/path?q=1'])
  })

  it('returns empty for null content', () => {
    expect(extractUrls(null)).toEqual([])
  })

  it('returns empty for content without URLs', () => {
    expect(extractUrls('just some text')).toEqual([])
  })

  it('deduplicates URLs', () => {
    expect(extractUrls('https://example.com and https://example.com again')).toHaveLength(1)
  })

  it('limits to 5 URLs', () => {
    const content = Array.from({ length: 10 }, (_, i) => `https://example.com/${i}`).join(' ')
    expect(extractUrls(content)).toHaveLength(5)
  })

  it('drops sentence punctuation from the last URL', () => {
    expect(extractUrls('read https://a.com/x and https://b.com/y.')).toEqual([
      'https://a.com/x',
      'https://b.com/y'
    ])
  })

  it.each([
    ['https://example.com/a,', 'https://example.com/a'],
    ['https://example.com/a.', 'https://example.com/a'],
    ['https://example.com/a!', 'https://example.com/a'],
    ['https://example.com/a?', 'https://example.com/a'],
    ['https://example.com/a;', 'https://example.com/a'],
    ['https://example.com/a:', 'https://example.com/a'],
    ['https://example.com/a**', 'https://example.com/a'],
    ["https://example.com/a').", 'https://example.com/a']
  ])('trims trailing prose from %s', (raw, expected) => {
    expect(extractUrls(`see ${raw}`)).toEqual([expected])
  })

  it('drops a closing paren that belongs to the sentence', () => {
    expect(extractUrls('(see https://example.com/a)')).toEqual(['https://example.com/a'])
  })

  it('keeps parens that are balanced inside the URL', () => {
    const url = 'https://en.wikipedia.org/wiki/Foo_(bar)'
    expect(extractUrls(`wiki ${url} rocks`)).toEqual([url])
  })

  it('keeps a balanced URL wrapped in prose parens', () => {
    const url = 'https://en.wikipedia.org/wiki/Foo_(bar)'
    expect(extractUrls(`(wiki ${url})`)).toEqual([url])
  })

  it('ignores a candidate that is only punctuation after trimming', () => {
    expect(extractUrls('https://.')).toEqual([])
  })
})

describe('decodeHtmlEntities', () => {
  it('decodes named entities', () => {
    expect(decodeHtmlEntities('&quot;Clean&quot; Code')).toBe('"Clean" Code')
  })

  it('decodes decimal and hex references', () => {
    expect(decodeHtmlEntities('Don&#039;t &#x26; won&#x27;t')).toBe("Don't & won't")
  })

  it('maps windows-1252 numeric references publishers emit', () => {
    expect(decodeHtmlEntities('it&#146;s')).toBe('it\u2019s')
  })

  it('decodes in a single pass so double-encoded input stays literal', () => {
    expect(decodeHtmlEntities('&amp;quot;')).toBe('&quot;')
  })

  it('leaves unknown entities untouched', () => {
    expect(decodeHtmlEntities('a &notarealentity; b')).toBe('a &notarealentity; b')
  })

  it('returns input unchanged when there is nothing to decode', () => {
    expect(decodeHtmlEntities('plain text')).toBe('plain text')
  })
})

describe('parseOgTags', () => {
  const base = 'https://example.com/post'

  const page = (head: string, body = '') => `<html><head>${head}</head><body>${body}</body></html>`

  it('reads og tags and decodes entities', () => {
    const html = page(`
      <meta property="og:title" content="&quot;Clean&quot; Code, Horrible Performance">
      <meta property="og:description" content="Many &quot;best practices&quot; are disasters.">
      <meta property="og:site_name" content="Computer, Enhance!">
    `)
    expect(parseOgTags(html, base)).toEqual({
      title: '"Clean" Code, Horrible Performance',
      description: 'Many "best practices" are disasters.',
      imageUrl: null,
      siteName: 'Computer, Enhance!'
    })
  })

  it('keeps content containing the other quote character', () => {
    const html = page(`<meta property="og:title" content="Don't stop believing">`)
    expect(parseOgTags(html, base).title).toBe("Don't stop believing")
  })

  it('handles single-quoted and unquoted attributes', () => {
    const html = page(`
      <meta property='og:title' content='Single quoted'>
      <meta property=og:site_name content=Example>
    `)
    const meta = parseOgTags(html, base)
    expect(meta.title).toBe('Single quoted')
    expect(meta.siteName).toBe('Example')
  })

  it('accepts content before property', () => {
    const html = page(`<meta content="Reversed order" property="og:title">`)
    expect(parseOgTags(html, base).title).toBe('Reversed order')
  })

  it('falls back through twitter tags then the title element', () => {
    expect(parseOgTags(page('<meta name="twitter:title" content="Tweet title">'), base).title).toBe('Tweet title')
    expect(parseOgTags(page('<title>Plain title</title>'), base).title).toBe('Plain title')
  })

  it('collapses whitespace in a multi-line title element', () => {
    expect(parseOgTags(page('<title>\n  Spread\n  out\n</title>'), base).title).toBe('Spread out')
  })

  it('resolves relative image URLs against the final URL', () => {
    const html = page('<meta property="og:image" content="/img/cover.png">')
    expect(parseOgTags(html, base).imageUrl).toBe('https://example.com/img/cover.png')
  })

  it('rejects non-http image URLs', () => {
    const html = page('<meta property="og:image" content="data:image/png;base64,AAAA">')
    expect(parseOgTags(html, base).imageUrl).toBeNull()
  })

  it('finds og tags emitted after the head', () => {
    const html = page('<title>Ignored</title>', '<meta property="og:description" content="In the body">')
    expect(parseOgTags(html, base).description).toBe('In the body')
  })

  it('prefers the first og:image when several are present', () => {
    const html = page(`
      <meta property="og:image" content="https://cdn.example.com/one.png">
      <meta property="og:image" content="https://cdn.example.com/two.png">
    `)
    expect(parseOgTags(html, base).imageUrl).toBe('https://cdn.example.com/one.png')
  })

  it('truncates overlong values', () => {
    const html = page(`<meta property="og:title" content="${'a'.repeat(400)}">`)
    expect(parseOgTags(html, base).title).toHaveLength(300)
  })

  it('returns nulls for a page with no metadata', () => {
    expect(parseOgTags(page(''), base)).toEqual({
      title: null,
      description: null,
      imageUrl: null,
      siteName: null
    })
  })

  it('ignores meta tags with no content attribute', () => {
    expect(parseOgTags(page('<meta property="og:title">'), base).title).toBeNull()
  })
})

describe('detectCharset', () => {
  it('prefers the content-type header', () => {
    expect(detectCharset('text/html; charset=ISO-8859-2', '<meta charset="utf-8">')).toBe('iso-8859-2')
  })

  it('falls back to the meta charset', () => {
    expect(detectCharset('text/html', '<meta charset="windows-1251">')).toBe('windows-1251')
  })

  it('defaults to utf-8', () => {
    expect(detectCharset('text/html', '<html>')).toBe('utf-8')
  })
})
