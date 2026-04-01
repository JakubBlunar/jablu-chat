import { createEventSchema, sendMessageSchema, editMessageSchema, MAX_MESSAGE_LENGTH } from '@chat/shared'

const UUID1 = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'

describe('createEventSchema', () => {
  const validBase = {
    name: 'Game Night',
    locationType: 'voice_channel' as const,
    channelId: UUID1,
    startAt: '2025-06-20T18:00:00.000Z',
  }

  it('accepts a valid voice_channel event', () => {
    const result = createEventSchema.safeParse(validBase)
    expect(result.success).toBe(true)
  })

  it('accepts a valid custom-location event', () => {
    const result = createEventSchema.safeParse({
      ...validBase,
      locationType: 'custom',
      channelId: undefined,
      locationText: 'Discord Stage',
    })
    expect(result.success).toBe(true)
  })

  it('rejects voice_channel without channelId', () => {
    const result = createEventSchema.safeParse({ ...validBase, channelId: undefined })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('channelId'))).toBe(true)
    }
  })

  it('rejects custom location without locationText', () => {
    const result = createEventSchema.safeParse({
      ...validBase,
      locationType: 'custom',
      channelId: undefined,
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('locationText'))).toBe(true)
    }
  })

  it('rejects custom location with blank locationText', () => {
    const result = createEventSchema.safeParse({
      ...validBase,
      locationType: 'custom',
      channelId: undefined,
      locationText: '   ',
    })
    expect(result.success).toBe(false)
  })

  it('rejects endAt before or equal to startAt', () => {
    const result = createEventSchema.safeParse({
      ...validBase,
      endAt: validBase.startAt,
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('endAt'))).toBe(true)
    }
  })

  it('accepts endAt after startAt', () => {
    const result = createEventSchema.safeParse({
      ...validBase,
      endAt: '2025-06-20T20:00:00.000Z',
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty event name', () => {
    const result = createEventSchema.safeParse({ ...validBase, name: '' })
    expect(result.success).toBe(false)
  })

  it('rejects name longer than 100 characters', () => {
    const result = createEventSchema.safeParse({ ...validBase, name: 'x'.repeat(101) })
    expect(result.success).toBe(false)
  })

  it('accepts valid recurrence rules', () => {
    for (const rule of ['daily', 'weekly', 'biweekly', 'monthly'] as const) {
      const result = createEventSchema.safeParse({ ...validBase, recurrenceRule: rule })
      expect(result.success).toBe(true)
    }
  })

  it('rejects invalid recurrence rule', () => {
    const result = createEventSchema.safeParse({ ...validBase, recurrenceRule: 'yearly' })
    expect(result.success).toBe(false)
  })
})

describe('sendMessageSchema', () => {
  it('accepts content-only message', () => {
    const result = sendMessageSchema.safeParse({ content: 'hello' })
    expect(result.success).toBe(true)
  })

  it('accepts attachment-only message', () => {
    const result = sendMessageSchema.safeParse({
      attachmentIds: [UUID1],
    })
    expect(result.success).toBe(true)
  })

  it('rejects message with neither content nor attachments', () => {
    const result = sendMessageSchema.safeParse({})
    expect(result.success).toBe(false)
  })

  it('rejects whitespace-only content without attachments', () => {
    const result = sendMessageSchema.safeParse({ content: '   ' })
    expect(result.success).toBe(false)
  })

  it('accepts whitespace content when attachments present', () => {
    const result = sendMessageSchema.safeParse({
      content: '   ',
      attachmentIds: [UUID1],
    })
    expect(result.success).toBe(true)
  })

  it('rejects content exceeding MAX_MESSAGE_LENGTH', () => {
    const result = sendMessageSchema.safeParse({ content: 'x'.repeat(MAX_MESSAGE_LENGTH + 1) })
    expect(result.success).toBe(false)
  })

  it('rejects more than 20 attachments', () => {
    const ids = Array.from({ length: 21 }, (_, i) =>
      `a0eebc99-9c0b-4ef8-bb6d-${String(i).padStart(12, '0')}`,
    )
    const result = sendMessageSchema.safeParse({ attachmentIds: ids })
    expect(result.success).toBe(false)
  })
})

describe('editMessageSchema', () => {
  it('accepts valid edit', () => {
    const result = editMessageSchema.safeParse({ content: 'updated' })
    expect(result.success).toBe(true)
  })

  it('rejects empty content', () => {
    const result = editMessageSchema.safeParse({ content: '' })
    expect(result.success).toBe(false)
  })

  it('rejects content exceeding MAX_MESSAGE_LENGTH', () => {
    const result = editMessageSchema.safeParse({ content: 'x'.repeat(MAX_MESSAGE_LENGTH + 1) })
    expect(result.success).toBe(false)
  })
})
