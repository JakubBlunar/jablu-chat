import {
  prepareReadingRestore,
  takeReadingOffset,
  clearVisits,
  rememberReadingPoint,
  readingPoint,
  recordVisit,
  useVisits
} from './conversationVisits'
const target = { kind: 'channel' as const, serverId: 's', channelId: 'a' }
afterEach(clearVisits)
it('restores ordinary returns and preserves explicit jump priority', () => {
  const point = { id: 'old', offset: -8 }
  rememberReadingPoint('channel:a', point)
  expect(readingPoint({ target, source: 'sidebar' })).toEqual(point)
  expect(readingPoint({ target, source: 'command' })).toEqual(point)
  expect(readingPoint({ target, position: { kind: 'latest' }, source: 'sidebar' })).toBeUndefined()
  expect(
    readingPoint({ target, position: { kind: 'message', messageId: 'else' }, source: 'notification' })
  ).toBeUndefined()
  clearVisits()
  expect(readingPoint({ target, source: 'sidebar' })).toBeUndefined()
})
it('deduplicates recent conversations and isolates logout', () => {
  recordVisit(target)
  recordVisit({ kind: 'dm', conversationId: 'd' })
  recordVisit(target)
  expect(useVisits.getState().recent).toEqual([target, { kind: 'dm', conversationId: 'd' }])
  clearVisits()
  expect(useVisits.getState().recent).toEqual([])
})

it('applies the pixel offset only to the prepared return, including when it is zero', () => {
  prepareReadingRestore('channel:a', { id: 'm', offset: 0 })
  expect(takeReadingOffset('dm:a', 'm')).toBeUndefined()
  expect(takeReadingOffset('channel:a', 'm')).toBe(0)
  expect(takeReadingOffset('channel:a', 'm')).toBeUndefined()
})
