import type { Attachment, LinkPreview } from '@chat/shared'
import { buildMessageMediaSlides } from './messageMediaSlides'

function att(overrides: Partial<Attachment> & Pick<Attachment, 'id' | 'type'>): Attachment {
  return {
    messageId: 'm1',
    filename: 'file',
    url: `/uploads/${overrides.id}`,
    mimeType: 'application/octet-stream',
    sizeBytes: 1234,
    width: null,
    height: null,
    thumbnailUrl: null,
    ...overrides
  }
}

function lp(overrides: Partial<LinkPreview> & Pick<LinkPreview, 'id' | 'url'>): LinkPreview {
  return {
    title: null,
    description: null,
    imageUrl: null,
    siteName: null,
    ...overrides
  } as LinkPreview
}

describe('buildMessageMediaSlides', () => {
  it('returns empty result for no media', () => {
    const { slides, indexByKey } = buildMessageMediaSlides([], [])
    expect(slides).toEqual([])
    expect(indexByKey.size).toBe(0)
  })

  it('handles undefined inputs safely', () => {
    const { slides, indexByKey } = buildMessageMediaSlides()
    expect(slides).toEqual([])
    expect(indexByKey.size).toBe(0)
  })

  it('maps image and gif attachments to image slides with dimensions', () => {
    const { slides, indexByKey } = buildMessageMediaSlides([
      att({ id: 'a1', type: 'image', filename: 'photo.png', url: '/uploads/a1.png', width: 800, height: 600 }),
      att({ id: 'a2', type: 'gif', filename: 'anim.gif', url: '/uploads/a2.gif' })
    ])

    expect(slides).toHaveLength(2)
    expect(slides[0]).toMatchObject({ type: 'image', src: '/uploads/a1.png', alt: 'photo.png', width: 800, height: 600 })
    expect(slides[1]).toMatchObject({ type: 'image', src: '/uploads/a2.gif', alt: 'anim.gif' })
    expect(indexByKey.get('a1')).toBe(0)
    expect(indexByKey.get('a2')).toBe(1)
  })

  it('maps video attachments to video slides with sources and poster', () => {
    const { slides, indexByKey } = buildMessageMediaSlides([
      att({
        id: 'v1',
        type: 'video',
        filename: 'clip.mp4',
        url: '/uploads/v1.mp4',
        mimeType: 'video/mp4',
        width: 1920,
        height: 1080,
        thumbnailUrl: '/uploads/v1-thumb.jpg'
      })
    ])

    expect(slides).toHaveLength(1)
    expect(slides[0]).toMatchObject({
      type: 'video',
      width: 1920,
      height: 1080,
      poster: '/uploads/v1-thumb.jpg',
      sources: [{ src: '/uploads/v1.mp4', type: 'video/mp4' }]
    })
    expect(indexByKey.get('v1')).toBe(0)
  })

  it('omits the source type for quicktime (.mov) so the browser sniffs the codec instead of skipping it', () => {
    const { slides } = buildMessageMediaSlides([
      att({
        id: 'v2',
        type: 'video',
        filename: 'clip.mov',
        url: '/uploads/v2.mov',
        mimeType: 'video/quicktime'
      })
    ])

    const source = (slides[0] as { sources: readonly { src: string; type?: string }[] }).sources[0]
    expect(source.src).toBe('/uploads/v2.mov')
    expect(source.type).toBeUndefined()
  })

  it('excludes file attachments', () => {
    const { slides, indexByKey } = buildMessageMediaSlides([
      att({ id: 'f1', type: 'file', filename: 'doc.pdf', url: '/uploads/f1.pdf' })
    ])
    expect(slides).toHaveLength(0)
    expect(indexByKey.has('f1')).toBe(false)
  })

  it('includes linked images and gifs after attachments, preserving order', () => {
    const { slides, indexByKey } = buildMessageMediaSlides(
      [att({ id: 'a1', type: 'image', url: '/uploads/a1.png' })],
      [
        lp({ id: 'lp-img', url: 'https://example.com/pic.jpg', title: 'A picture' }),
        lp({ id: 'lp-gif', url: 'https://media.tenor.com/abc.gif' })
      ]
    )

    expect(slides).toHaveLength(3)
    expect(indexByKey.get('a1')).toBe(0)
    expect(indexByKey.get('lp-img')).toBe(1)
    expect(indexByKey.get('lp-gif')).toBe(2)
    expect(slides[1]).toMatchObject({ type: 'image', src: 'https://example.com/pic.jpg', alt: 'A picture' })
  })

  it('prefers imageUrl over url for linked images', () => {
    const { slides } = buildMessageMediaSlides(
      [],
      [lp({ id: 'lp1', url: 'https://example.com/page.png', imageUrl: 'https://cdn.example.com/full.png' })]
    )
    expect(slides[0]).toMatchObject({ src: 'https://cdn.example.com/full.png' })
  })

  it('excludes YouTube and non-media link previews', () => {
    const { slides, indexByKey } = buildMessageMediaSlides(
      [],
      [
        lp({ id: 'yt', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', imageUrl: 'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg' }),
        lp({ id: 'article', url: 'https://example.com/news', title: 'Some article' })
      ]
    )
    expect(slides).toHaveLength(0)
    expect(indexByKey.has('yt')).toBe(false)
    expect(indexByKey.has('article')).toBe(false)
  })
})
