import type { ServerLayoutEntry } from '../types/server.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isServerLayout(value: unknown): value is ServerLayoutEntry[] {
  if (!Array.isArray(value) || value.length > 1000) return false
  const serverIds = new Set<string>()
  const folderIds = new Set<string>()
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') return false
    let ids: unknown[]
    if (entry.type === 'server') {
      ids = [entry.serverId]
    } else if (entry.type === 'folder') {
      if (typeof entry.id !== 'string' || !UUID.test(entry.id) || folderIds.has(entry.id)) return false
      folderIds.add(entry.id)
      if (folderIds.size > 100 || typeof entry.name !== 'string' || !entry.name.trim() || entry.name.length > 50)
        return false
      if (typeof entry.collapsed !== 'boolean' || !Array.isArray(entry.serverIds)) return false
      ids = entry.serverIds
    } else {
      return false
    }
    for (const id of ids) {
      if (typeof id !== 'string' || !UUID.test(id) || serverIds.has(id)) return false
      serverIds.add(id)
      if (serverIds.size > 1000) return false
    }
  }
  return true
}

export function reconcileServerLayout(layout: ServerLayoutEntry[], serverIds: string[]): ServerLayoutEntry[] {
  const available = new Set(serverIds)
  const included = new Set<string>()
  const take = (id: string) => {
    if (!available.has(id) || included.has(id)) return false
    included.add(id)
    return true
  }
  const result: ServerLayoutEntry[] = []
  for (const entry of layout) {
    if (entry.type === 'server') {
      if (take(entry.serverId)) result.push(entry)
    } else {
      result.push({ ...entry, serverIds: entry.serverIds.filter(take) })
    }
  }
  for (const serverId of serverIds) {
    if (take(serverId)) result.push({ type: 'server', serverId })
  }
  return result
}
