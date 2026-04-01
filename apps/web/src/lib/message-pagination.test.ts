import { MAX_MESSAGES, toChronological, trimOldest, trimNewest } from './message-pagination'
import { makeMessages, resetMsgSeq } from '@/test/factories'

beforeEach(() => resetMsgSeq())

describe('MAX_MESSAGES', () => {
  it('is 250', () => {
    expect(MAX_MESSAGES).toBe(250)
  })
})

describe('toChronological', () => {
  it('reverses the array', () => {
    const msgs = makeMessages(3)
    const result = toChronological(msgs)
    expect(result[0].id).toBe(msgs[2].id)
    expect(result[2].id).toBe(msgs[0].id)
  })

  it('does not mutate the original', () => {
    const msgs = makeMessages(3)
    const firstId = msgs[0].id
    toChronological(msgs)
    expect(msgs[0].id).toBe(firstId)
  })

  it('handles empty array', () => {
    expect(toChronological([])).toEqual([])
  })
})

describe('trimOldest', () => {
  it('returns the array unchanged when under limit', () => {
    const msgs = makeMessages(5)
    expect(trimOldest(msgs)).toBe(msgs)
  })

  it('keeps the newest MAX_MESSAGES items', () => {
    const msgs = makeMessages(MAX_MESSAGES + 10)
    const result = trimOldest(msgs)
    expect(result).toHaveLength(MAX_MESSAGES)
    expect(result[result.length - 1].id).toBe(msgs[msgs.length - 1].id)
  })
})

describe('trimNewest', () => {
  it('returns the array unchanged when under limit', () => {
    const msgs = makeMessages(5)
    expect(trimNewest(msgs)).toBe(msgs)
  })

  it('keeps the oldest MAX_MESSAGES items', () => {
    const msgs = makeMessages(MAX_MESSAGES + 10)
    const result = trimNewest(msgs)
    expect(result).toHaveLength(MAX_MESSAGES)
    expect(result[0].id).toBe(msgs[0].id)
  })
})
