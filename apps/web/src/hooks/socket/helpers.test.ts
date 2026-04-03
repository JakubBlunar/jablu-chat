import { describeAttachments, notifBody } from './helpers'
import type { Message } from '@chat/shared'

function makeMsg(overrides: Partial<Message> = {}): Message {
  return {
    id: 'm1',
    content: null,
    authorId: 'u1',
    channelId: 'ch1',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    attachments: [],
    reactions: [],
    ...overrides
  } as Message
}

describe('describeAttachments', () => {
  it('returns "[attachment]" when no attachments', () => {
    expect(describeAttachments(makeMsg())).toBe('[attachment]')
    expect(describeAttachments(makeMsg({ attachments: undefined as any }))).toBe('[attachment]')
  })

  it('describes a single image', () => {
    const msg = makeMsg({ attachments: [{ type: 'image' }] as any })
    expect(describeAttachments(msg)).toBe('sent an image')
  })

  it('describes a single video', () => {
    const msg = makeMsg({ attachments: [{ type: 'video' }] as any })
    expect(describeAttachments(msg)).toBe('sent a video')
  })

  it('describes a single GIF', () => {
    const msg = makeMsg({ attachments: [{ type: 'gif' }] as any })
    expect(describeAttachments(msg)).toBe('sent a GIF')
  })

  it('describes a single file', () => {
    const msg = makeMsg({ attachments: [{ type: 'file' }] as any })
    expect(describeAttachments(msg)).toBe('sent a file')
  })

  it('describes multiple attachments with count', () => {
    const msg = makeMsg({ attachments: [{ type: 'image' }, { type: 'video' }, { type: 'file' }] as any })
    expect(describeAttachments(msg)).toBe('sent 3 files')
  })
})

describe('notifBody', () => {
  it('returns content when present', () => {
    expect(notifBody(makeMsg({ content: 'Hello world' }))).toBe('Hello world')
  })

  it('truncates content at 100 characters', () => {
    const long = 'a'.repeat(200)
    expect(notifBody(makeMsg({ content: long }))).toHaveLength(100)
  })

  it('falls back to describeAttachments when content is empty', () => {
    expect(notifBody(makeMsg({ content: '' }))).toBe('[attachment]')
    expect(notifBody(makeMsg({ content: '   ' }))).toBe('[attachment]')
  })

  it('falls back to describeAttachments when content is null', () => {
    expect(notifBody(makeMsg({ content: null }))).toBe('[attachment]')
  })

  it('describes attachments when no content', () => {
    const msg = makeMsg({ content: null, attachments: [{ type: 'image' }] as any })
    expect(notifBody(msg)).toBe('sent an image')
  })
})
