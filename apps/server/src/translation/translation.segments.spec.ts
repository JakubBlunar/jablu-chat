import { reassemble, textSegments, tokenize } from './translation.segments'

describe('translation.segments', () => {
  const SAMPLES: [string, string][] = [
    ['Hello world', 'plain'],
    ['Hey **bold** and *italic* and `code` here', 'inline'],
    ['Check https://example.com/a?b=1&c=2 and see', 'url'],
    ['ping @alice and @[Bob Smith] and @here', 'mentions'],
    ['- item one\n- item two with `code`', 'list'],
    ['> quote line\n> more quote', 'blockquote'],
    ['# Heading\n\nBody here', 'heading'],
    ['Intro text here.\n```ts\nconst x = "do not translate";\nfetch("https://x.dev");\n```\nOutro text.', 'fence ts'],
    ['```\ncode only, no lang\n```', 'fence bare'],
    ['Start\n```js\nlet url = "https://in-fence.dev/";\nlet at = "@in-fence";\nlet back = `in code`;\n```\nEnd', 'fence with url+mention+code inside'],
    ['~~~\nwave fence\n~~~', 'tilde fence'],
    ['| a | b |\n| --- | --- |\n| 1 | 2 |\n', 'table'],
    ['Line one.\n\n\nLine three after blank.', 'blank lines'],
    ['  indented text\n  more', 'indent (not code: 2 spaces)'],
    ['1. ordered\n2. second', 'ordered list'],
    ['* star bullet\n+ plus bullet', 'bullets'],
    ['mix: **b** url https://u.io/p and @bob end', 'all-in-one'],
    ['just `a code`', 'only code'],
    ['https://only-url.dev/path', 'only url'],
    ['before\n```python\ndef f():\n    return "https://x.y"  # comment\n```\nafter', 'indented code inside fence'],
    ['~~strike~~ and ~~~', 'strikethrough'],
    ['unclosed fence at the end:\n```ts\nconst a = 1;', 'unclosed fence'],
    ['four backticks\n````\ncode\n````\nafter', 'longer fence'],
  ]

  it.each(SAMPLES)('round-trips %s byte-for-byte with no translation', (content) => {
    expect(reassemble(tokenize(content))).toBe(content)
  })

  it.each(SAMPLES)('never sends code, urls or mentions as text for %s', (content) => {
    const batch = textSegments(tokenize(content))
    for (const seg of batch) {
      expect(seg.trim().startsWith('http://') || seg.trim().startsWith('https://')).toBe(false)
      expect(seg).not.toMatch(/`[^`]+`/)
      // a mention must never become a whole text segment
      expect(seg.trim()).not.toMatch(/^@\[?[^\s]{2,}\]?$/)
    }
  })

  it.each(SAMPLES)('keeps protected pieces verbatim after translation for %s', (content) => {
    const tokens = tokenize(content)
    const batch = textSegments(tokens)
    const fake = batch.map((s) => `[T:${s.length}]`)
    const rebuilt = reassemble(tokens, fake)
    for (const tok of tokens) {
      if (tok.t === 'keep' && tok.s) {
        expect(rebuilt).toContain(tok.s)
      }
    }
    // number of text substitutions equals number of text segments
    const textCount = (rebuilt.match(/\[T:\d+\]/g) ?? []).length
    expect(textCount).toBe(batch.length)
  })

  it('reassembles with partial translations (fallback to original)', () => {
    const content = 'Hello there, how are you?'
    const tokens = tokenize(content)
    const empty: string[] = ['']
    const translated: string[] = ['Ahoj']
    const partial: (string | null)[] = [null]
    expect(reassemble(tokens, partial)).toBe(content)
    expect(reassemble(tokens, empty)).toBe(content)
    expect(reassemble(tokens, translated)).toBe('Ahoj')
  })
})
