import type { Channel, ChannelCategory, Message } from '@chat/shared'
import { cacheSession, readMessages, readStructure } from './db'
import { pendingDiskWrite } from './messageDiskMirror'
import { onCacheChange, onDiskContextMutation, type CacheKey, peekContext, putContext } from './messageCache'
import {
  getChannels,
  getPermissions,
  getServerList,
  onStructureChange,
  putChannels,
  putPermissions,
  putServerList
} from './structureCache'

/**
 * Reading from disk writes into the memory caches, which would otherwise
 * bounce straight back out through the persistence listener. This flag lets
 * that listener ignore its own echo.
 */
let hydrating = false

export function isHydrating(): boolean {
  return hydrating
}

function withoutPersisting<T>(fn: () => T): T {
  hydrating = true
  try {
    return fn()
  } finally {
    hydrating = false
  }
}

/**
 * Pull one context off disk into the memory cache, marked stale so callers
 * know to revalidate. Returns false when there is nothing usable.
 */
export async function hydrateContextFromDisk(key: CacheKey): Promise<boolean> {
  if (peekContext(key)) return true

  const session = cacheSession()
  // A delete or patch may arrive after the read transaction has started.
  // Retry only this context if its disk snapshot changed during that read.
  let changed: boolean
  const trackChange = (other: string) => {
    if (key === other) changed = true
  }
  const offChange = onCacheChange(trackChange)
  const offMutation = onDiskContextMutation(trackChange)
  let record
  try {
    do {
      changed = false
      const pending = pendingDiskWrite(key)
      if (pending) await pending
      if (session !== cacheSession()) return false
      record = await readMessages(key)
    } while (changed && !peekContext(key) && session === cacheSession())
  } finally {
    offChange()
    offMutation()
  }
  if (session !== cacheSession()) return false
  if (peekContext(key)) return true
  if (!record || !Array.isArray(record.messages) || record.messages.length === 0) return false

  withoutPersisting(() => {
    putContext(key, {
      messages: record.messages as Message[],
      hasMore: record.hasMore,
      hasNewer: record.hasNewer,
      stale: true,
      updatedAt: record.updatedAt
    })
  })
  return true
}

/** Load one server's sidebar off disk, without clobbering fresher data. */
export async function hydrateServerStructureFromDisk(serverId: string): Promise<void> {
  const session = cacheSession()
  let invalidated = false
  const unsubscribe = onStructureChange((_kind, id, value) => {
    if (id === serverId && value === null) invalidated = true
  })
  const [channels, permissions] = await Promise.all([
    readStructure<{ channels: Channel[]; categories: ChannelCategory[] }>(`channels:${serverId}`),
    readStructure<Record<string, string>>(`permissions:${serverId}`)
  ]).finally(unsubscribe)
  if (invalidated || session !== cacheSession()) return

  withoutPersisting(() => {
    if (channels && !getChannels(serverId)) {
      putChannels(serverId, channels.channels, channels.categories)
    }
    if (permissions && !getPermissions(serverId)) {
      putPermissions(serverId, permissions)
    }
  })
}

export async function hydrateServerListFromDisk(): Promise<void> {
  if (getServerList()) return
  const session = cacheSession()
  const servers = await readStructure<unknown[]>('servers')
  if (session !== cacheSession() || !servers || getServerList()) return
  withoutPersisting(() => putServerList(servers))
}
