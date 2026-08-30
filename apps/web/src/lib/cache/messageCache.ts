import type { Message } from '@chat/shared'

/** How many contexts stay resident. Beyond this the least recently used goes. */
export const MAX_CACHED_CONTEXTS = 30

/**
 * How many messages are kept per context. Only the newest page is cached: it
 * bounds memory and disk, and it makes revalidation a tail replace rather than
 * a range diff against arbitrary scrollback.
 */
export const CACHE_PAGE_SIZE = 50

export type CacheKey = string

export type CachedContext = {
  messages: Message[]
  hasMore: boolean
  hasNewer: boolean
  updatedAt: number
  /**
   * True when the entry came off disk and has not been checked against the
   * server yet. Entries kept live by socket events are not stale.
   */
  stale: boolean
}

/**
 * Channel ids and conversation ids live in the same map, so they are
 * namespaced. Both are uuids and would otherwise be indistinguishable.
 */
export function channelKey(channelId: string): CacheKey {
  return `ch:${channelId}`
}

export function dmKey(conversationId: string): CacheKey {
  return `dm:${conversationId}`
}

/** Insertion order doubles as LRU order: re-inserting moves a key to the end. */
const cache = new Map<CacheKey, CachedContext>()

/** Notified whenever an entry changes, so the disk layer can persist it. */
type Listener = (key: CacheKey, entry: CachedContext | null) => void
const listeners = new Set<Listener>()

export function onCacheChange(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function emit(key: CacheKey, entry: CachedContext | null) {
  for (const listener of listeners) {
    try {
      listener(key, entry)
    } catch {
      // A failing persistence listener must not break navigation.
    }
  }
}

function trimToPage(messages: Message[]): Message[] {
  return messages.length > CACHE_PAGE_SIZE ? messages.slice(messages.length - CACHE_PAGE_SIZE) : messages
}

function evictIfNeeded() {
  while (cache.size > MAX_CACHED_CONTEXTS) {
    const oldest = cache.keys().next()
    if (oldest.done) return
    cache.delete(oldest.value)
    emit(oldest.value, null)
  }
}

/**
 * Store the newest page of a context.
 *
 * `hasMore` is forced true whenever the tail was trimmed, because older
 * messages certainly exist even if the caller had them all in memory.
 */
export function putContext(
  key: CacheKey,
  input: { messages: Message[]; hasMore: boolean; hasNewer: boolean; stale?: boolean; updatedAt?: number }
): void {
  const trimmed = trimToPage(input.messages)
  const entry: CachedContext = {
    messages: trimmed,
    hasMore: input.hasMore || trimmed.length < input.messages.length,
    hasNewer: input.hasNewer,
    stale: input.stale ?? false,
    updatedAt: input.updatedAt ?? Date.now()
  }

  cache.delete(key)
  cache.set(key, entry)
  evictIfNeeded()
  emit(key, entry)
}

/** Read without changing LRU order. Use for inspection, not for navigation. */
export function peekContext(key: CacheKey): CachedContext | null {
  return cache.get(key) ?? null
}

/** Read and mark as most recently used. */
export function getContext(key: CacheKey): CachedContext | null {
  const entry = cache.get(key)
  if (!entry) return null
  cache.delete(key)
  cache.set(key, entry)
  return entry
}

export function hasContext(key: CacheKey): boolean {
  return cache.has(key)
}

/**
 * Apply a change to a cached context without promoting it. Used by socket
 * handlers so a channel the user is not looking at stays correct.
 *
 * Returns false when the context is not cached, letting callers skip work.
 */
export function updateContext(
  key: CacheKey,
  mutate: (entry: CachedContext) => CachedContext | null
): boolean {
  const entry = cache.get(key)
  if (!entry) return false

  const next = mutate(entry)
  if (!next) return false
  if (next === entry) return true

  const trimmed = trimToPage(next.messages)
  const updated: CachedContext = {
    ...next,
    messages: trimmed,
    hasMore: next.hasMore || trimmed.length < next.messages.length,
    updatedAt: Date.now()
  }
  cache.set(key, updated)
  emit(key, updated)
  return true
}

export function markStale(key: CacheKey): void {
  const entry = cache.get(key)
  if (!entry || entry.stale) return
  cache.set(key, { ...entry, stale: true })
}

export function evictContext(key: CacheKey): void {
  if (!cache.delete(key)) return
  emit(key, null)
}

/** Drop everything. Called on logout and on a cache version change. */
export function clearCache(notify = true): void {
  const keys = [...cache.keys()]
  cache.clear()
  if (!notify) return
  for (const key of keys) emit(key, null)
}

/** Test and diagnostics helper. */
export function cacheKeys(): CacheKey[] {
  return [...cache.keys()]
}
