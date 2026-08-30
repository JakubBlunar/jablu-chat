import type { Channel, ChannelCategory } from '@chat/shared'

/**
 * The shape of a server that the sidebar needs. Kept structurally loose so the
 * cache does not have to import the store's augmented `Server` type.
 */
export type CachedServerList = { servers: unknown[]; updatedAt: number }

export type CachedChannels = {
  channels: Channel[]
  categories: ChannelCategory[]
  updatedAt: number
}

/** Channel id to the wire form of its permission bitfield. */
export type CachedPermissions = { permissions: Record<string, string>; updatedAt: number }

export type StructureKind = 'servers' | 'channels' | 'permissions'

type Listener = (kind: StructureKind, serverId: string | null, value: unknown | null) => void

const listeners = new Set<Listener>()

export function onStructureChange(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function emit(kind: StructureKind, serverId: string | null, value: unknown | null) {
  for (const listener of listeners) {
    try {
      listener(kind, serverId, value)
    } catch {
      // A failing persistence listener must not break navigation.
    }
  }
}

let serverList: CachedServerList | null = null
const channelsByServer = new Map<string, CachedChannels>()
const permissionsByServer = new Map<string, CachedPermissions>()

export function putServerList(servers: unknown[], updatedAt = Date.now()): void {
  serverList = { servers, updatedAt }
  emit('servers', null, serverList)
}

export function getServerList(): CachedServerList | null {
  return serverList
}

export function putChannels(
  serverId: string,
  channels: Channel[],
  categories: ChannelCategory[],
  updatedAt = Date.now()
): void {
  const entry: CachedChannels = { channels, categories, updatedAt }
  channelsByServer.set(serverId, entry)
  emit('channels', serverId, entry)
}

export function getChannels(serverId: string): CachedChannels | null {
  return channelsByServer.get(serverId) ?? null
}

export function putPermissions(
  serverId: string,
  permissions: Record<string, string>,
  updatedAt = Date.now()
): void {
  const entry: CachedPermissions = { permissions, updatedAt }
  permissionsByServer.set(serverId, entry)
  emit('permissions', serverId, entry)
}

export function getPermissions(serverId: string): CachedPermissions | null {
  return permissionsByServer.get(serverId) ?? null
}

/** Forget a server entirely, e.g. after leaving it or on a 403. */
export function evictServer(serverId: string): void {
  if (channelsByServer.delete(serverId)) emit('channels', serverId, null)
  if (permissionsByServer.delete(serverId)) emit('permissions', serverId, null)
}

export function clearStructureCache(notify = true): void {
  const serverIds = new Set([...channelsByServer.keys(), ...permissionsByServer.keys()])
  serverList = null
  channelsByServer.clear()
  permissionsByServer.clear()
  if (!notify) return
  emit('servers', null, null)
  for (const serverId of serverIds) {
    emit('channels', serverId, null)
    emit('permissions', serverId, null)
  }
}
