import { makeMessage, resetMsgSeq } from '@/test/factories'
import {
  CACHE_PAGE_SIZE,
  MAX_CACHED_CONTEXTS,
  cacheKeys,
  channelKey,
  clearCache,
  dmKey,
  evictContext,
  getContext,
  markStale,
  onCacheChange,
  peekContext,
  putContext,
  updateContext
} from './messageCache'

function messages(count: number, prefix = 'm') {
  return Array.from({ length: count }, (_, i) => makeMessage({ id: `${prefix}-${i + 1}` }))
}

function put(key: string, count: number) {
  putContext(key, { messages: messages(count, key), hasMore: false, hasNewer: false })
}

beforeEach(() => {
  resetMsgSeq()
  clearCache(false)
})

describe('messageCache keys', () => {
  it('namespaces channels and conversations so ids cannot collide', () => {
    const sharedId = 'same-uuid'
    putContext(channelKey(sharedId), {
      messages: [makeMessage({ id: 'from-channel' })],
      hasMore: false,
      hasNewer: false
    })
    putContext(dmKey(sharedId), {
      messages: [makeMessage({ id: 'from-dm' })],
      hasMore: false,
      hasNewer: false
    })

    expect(peekContext(channelKey(sharedId))?.messages[0].id).toBe('from-channel')
    expect(peekContext(dmKey(sharedId))?.messages[0].id).toBe('from-dm')
    expect(cacheKeys()).toHaveLength(2)
  })
})

describe('messageCache trimming', () => {
  it('keeps only the newest page', () => {
    const all = messages(CACHE_PAGE_SIZE + 20)
    putContext('ch:a', { messages: all, hasMore: false, hasNewer: false })

    const entry = peekContext('ch:a')!
    expect(entry.messages).toHaveLength(CACHE_PAGE_SIZE)
    expect(entry.messages[entry.messages.length - 1].id).toBe(all[all.length - 1].id)
  })

  it('sets hasMore when the tail was trimmed, even if the caller said otherwise', () => {
    putContext('ch:a', { messages: messages(CACHE_PAGE_SIZE + 1), hasMore: false, hasNewer: false })
    expect(peekContext('ch:a')!.hasMore).toBe(true)
  })

  it('leaves hasMore alone for a page that fits', () => {
    putContext('ch:a', { messages: messages(10), hasMore: false, hasNewer: false })
    expect(peekContext('ch:a')!.hasMore).toBe(false)
  })
})

describe('messageCache LRU', () => {
  it('evicts the least recently used context past the cap', () => {
    for (let i = 0; i < MAX_CACHED_CONTEXTS + 3; i++) put(`ch:${i}`, 2)

    expect(cacheKeys()).toHaveLength(MAX_CACHED_CONTEXTS)
    expect(peekContext('ch:0')).toBeNull()
    expect(peekContext('ch:2')).toBeNull()
    expect(peekContext('ch:3')).not.toBeNull()
  })

  it('getContext promotes an entry so it survives the next eviction', () => {
    for (let i = 0; i < MAX_CACHED_CONTEXTS; i++) put(`ch:${i}`, 2)

    getContext('ch:0')
    put('ch:new', 2)

    expect(peekContext('ch:0')).not.toBeNull()
    expect(peekContext('ch:1')).toBeNull()
  })

  it('peekContext does not promote', () => {
    for (let i = 0; i < MAX_CACHED_CONTEXTS; i++) put(`ch:${i}`, 2)

    peekContext('ch:0')
    put('ch:new', 2)

    expect(peekContext('ch:0')).toBeNull()
  })

  it('re-putting an existing key promotes it rather than growing the map', () => {
    for (let i = 0; i < MAX_CACHED_CONTEXTS; i++) put(`ch:${i}`, 2)
    put('ch:0', 3)

    expect(cacheKeys()).toHaveLength(MAX_CACHED_CONTEXTS)
    expect(peekContext('ch:0')!.messages).toHaveLength(3)
  })
})

describe('messageCache mutation', () => {
  it('updateContext reports a miss without creating an entry', () => {
    const applied = updateContext('ch:missing', (entry) => entry)
    expect(applied).toBe(false)
    expect(cacheKeys()).toEqual([])
  })

  it('updateContext does not promote the entry it changes', () => {
    for (let i = 0; i < MAX_CACHED_CONTEXTS; i++) put(`ch:${i}`, 2)

    updateContext('ch:0', (entry) => ({ ...entry, messages: [...entry.messages] }))
    put('ch:new', 2)

    expect(peekContext('ch:0')).toBeNull()
  })

  it('markStale flags an entry without touching its contents', () => {
    put('ch:a', 3)
    markStale('ch:a')

    const entry = peekContext('ch:a')!
    expect(entry.stale).toBe(true)
    expect(entry.messages).toHaveLength(3)
  })
})

describe('messageCache notifications', () => {
  it('reports writes and deletions to listeners', () => {
    const seen: Array<[string, boolean]> = []
    const off = onCacheChange((key, entry) => seen.push([key, entry !== null]))

    put('ch:a', 1)
    evictContext('ch:a')
    off()
    put('ch:b', 1)

    expect(seen).toEqual([
      ['ch:a', true],
      ['ch:a', false]
    ])
  })

  it('survives a listener that throws', () => {
    const off = onCacheChange(() => {
      throw new Error('persistence is down')
    })

    expect(() => put('ch:a', 1)).not.toThrow()
    expect(peekContext('ch:a')).not.toBeNull()
    off()
  })
})
