import { escapeHtml, VIDEO_ALLOWED_ATTRS, AUDIO_ALLOWED_ATTRS } from '@/lib/markdownSecurity'

describe('escapeHtml', () => {
  it('escapes ampersands', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b')
  })

  it('escapes double quotes', () => {
    expect(escapeHtml('say "hello"')).toBe('say &quot;hello&quot;')
  })

  it('escapes single quotes', () => {
    expect(escapeHtml("it's")).toBe('it&#39;s')
  })

  it('escapes less-than', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;')
  })

  it('escapes greater-than', () => {
    expect(escapeHtml('1 > 0')).toBe('1 &gt; 0')
  })

  it('escapes all special chars in a combined string', () => {
    expect(escapeHtml('<img alt="x\'s & y\'s">')).toBe(
      '&lt;img alt=&quot;x&#39;s &amp; y&#39;s&quot;&gt;'
    )
  })

  it('returns original string when no special chars are present', () => {
    expect(escapeHtml('hello world')).toBe('hello world')
  })

  it('handles empty string', () => {
    expect(escapeHtml('')).toBe('')
  })
})

describe('video sanitize attributes', () => {
  it('does not allow autoPlay', () => {
    expect([...VIDEO_ALLOWED_ATTRS]).not.toContain('autoPlay')
    expect([...VIDEO_ALLOWED_ATTRS]).not.toContain('autoplay')
  })

  it('still allows controls, muted, playsInline', () => {
    expect([...VIDEO_ALLOWED_ATTRS]).toContain('controls')
    expect([...VIDEO_ALLOWED_ATTRS]).toContain('muted')
    expect([...VIDEO_ALLOWED_ATTRS]).toContain('playsInline')
  })
})

describe('audio sanitize attributes', () => {
  it('does not allow autoPlay', () => {
    expect([...AUDIO_ALLOWED_ATTRS]).not.toContain('autoPlay')
    expect([...AUDIO_ALLOWED_ATTRS]).not.toContain('autoplay')
  })

  it('still allows controls', () => {
    expect([...AUDIO_ALLOWED_ATTRS]).toContain('controls')
  })
})
