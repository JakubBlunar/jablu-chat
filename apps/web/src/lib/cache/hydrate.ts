import type { Channel, ChannelCategory, Message } from '@chat/shared'
import { cacheSession, readMessages, readStructure } from './db'
import { type CacheKey, peekContext, putContext } from './messageCache'
import { getChannels, getPermissions, getServerList, putChannels, putPermissions, putServerList } from './structureCache'

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
  const record = await readMessages(key)
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
  const [channels, permissions] = await Promise.all([
    readStructure<{ channels: Channel[]; categories: ChannelCategory[] }>(`channels:${serverId}`),
    readStructure<Record<string, string>>(`permissions:${serverId}`)
  ])
  if (session !== cacheSession()) return

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
