import { getIsStandalone } from '@/hooks/usePwaInstall'
import { isDesktop } from '@/lib/desktop'
import { clearCacheDb, deleteMessages, deleteStructure, initCacheDb, writeMessages, writeStructure } from './db'
import { isHydrating } from './hydrate'
import { type CacheKey, onCacheChange, peekContext } from './messageCache'
import { getChannels, getPermissions, getServerList, onStructureChange, type StructureKind } from './structureCache'

/** Longest a write may sit unflushed when the browser never goes idle. */
const FLUSH_TIMEOUT_MS = 2000

const pendingMessageKeys = new Set<CacheKey>()
const pendingStructureKeys = new Set<string>()
let flushHandle: number | null = null

function structureKey(kind: StructureKind, serverId: string | null): string {
  return kind === 'servers' ? 'servers' : `${kind}:${serverId}`
}

function scheduleFlush() {
  if (flushHandle !== null) return

  const run = () => {
    flushHandle = null
    void flush()
  }

  // Persisting is never urgent, so it waits for the browser to be free.
  if (typeof requestIdleCallback === 'function') {
    flushHandle = requestIdleCallback(run, { timeout: FLUSH_TIMEOUT_MS }) as unknown as number
  } else {
    flushHandle = setTimeout(run, FLUSH_TIMEOUT_MS) as unknown as number
  }
}

async function flush() {
  const messageKeys = [...pendingMessageKeys]
  const structureKeys = [...pendingStructureKeys]
  pendingMessageKeys.clear()
  pendingStructureKeys.clear()

  for (const key of messageKeys) {
    const entry = peekContext(key)
    if (!entry) {
      await deleteMessages(key)
      continue
    }
    await writeMessages({
      key,
      messages: entry.messages,
      hasMore: entry.hasMore,
      hasNewer: entry.hasNewer,
      updatedAt: entry.updatedAt
    })
  }

  for (const key of structureKeys) {
    const value = readStructureFromMemory(key)
    if (value === null) {
      await deleteStructure(key)
      continue
    }
    await writeStructure(key, value)
  }
}

function readStructureFromMemory(key: string): unknown | null {
  if (key === 'servers') return getServerList()?.servers ?? null
  const [kind, serverId] = key.split(':')
  if (kind === 'channels') {
    const entry = getChannels(serverId)
    return entry ? { channels: entry.channels, categories: entry.categories } : null
  }
  if (kind === 'permissions') return getPermissions(serverId)?.permissions ?? null
  return null
}

let stopListening: (() => void) | null = null

/**
 * Start mirroring the in-memory caches to disk.
 *
 * Persistent storage is only requested on desktop and installed PWA. In a
 * plain browser tab the cache still works, it is just evictable, which is the
 * right trade for storage the user did not opt into.
 */
export async function startCachePersistence(userId: string | null): Promise<void> {
  stopCachePersistence()

  if ((isDesktop || getIsStandalone()) && typeof navigator !== 'undefined' && navigator.storage?.persist) {
    void navigator.storage.persist().catch(() => {})
  }

  await initCacheDb(userId)

  const offCache = onCacheChange((key) => {
    if (isHydrating()) return
    pendingMessageKeys.add(key)
    scheduleFlush()
  })

  const offStructure = onStructureChange((kind, serverId) => {
    if (isHydrating()) return
    pendingStructureKeys.add(structureKey(kind, serverId))
    scheduleFlush()
  })

  stopListening = () => {
    offCache()
    offStructure()
  }
}

export function stopCachePersistence(): void {
  stopListening?.()
  stopListening = null
  pendingMessageKeys.clear()
  pendingStructureKeys.clear()
  if (flushHandle === null) return
  if (typeof cancelIdleCallback === 'function') cancelIdleCallback(flushHandle)
  else clearTimeout(flushHandle)
  flushHandle = null
}

/** Wipe both halves of the cache. Called on sign-out. */
export async function purgeCache(): Promise<void> {
  stopCachePersistence()
  await clearCacheDb()
}
