import type { ServerLayoutEntry } from '@chat/shared'

export function layoutEntryId(entry: ServerLayoutEntry): string {
  return entry.type === 'server' ? `server:${entry.serverId}` : `folder:${entry.id}`
}

export function moveServer(
  entries: ServerLayoutEntry[],
  serverId: string,
  folderId: string | null,
  index?: number
): ServerLayoutEntry[] {
  if (folderId && !entries.some((entry) => entry.type === 'folder' && entry.id === folderId)) {
    throw new Error('Destination folder does not exist')
  }
  const next = entries.flatMap<ServerLayoutEntry>((entry) =>
    entry.type === 'server'
      ? entry.serverId === serverId
        ? []
        : [entry]
      : [{ ...entry, serverIds: entry.serverIds.filter((id) => id !== serverId) }]
  )
  if (folderId) {
    return next.map((entry) => {
      if (entry.type !== 'folder' || entry.id !== folderId) return entry
      const serverIds = [...entry.serverIds]
      serverIds.splice(index ?? serverIds.length, 0, serverId)
      return { ...entry, serverIds }
    })
  }
  next.splice(index ?? next.length, 0, { type: 'server', serverId })
  return next
}

export function applyLayoutDrop(
  entries: ServerLayoutEntry[],
  activeId: string,
  targetId: string,
  after = false
): ServerLayoutEntry[] {
  if (activeId === targetId) return entries
  const active = entries.find((entry) => layoutEntryId(entry) === activeId)
  if (active?.type === 'folder') {
    const next = entries.filter((entry) => entry !== active)
    const targetIndex = next.findIndex(
      (entry) =>
        layoutEntryId(entry) === targetId ||
        (entry.type === 'folder' && entry.serverIds.some((id) => `server:${id}` === targetId))
    )
    if (targetId !== 'root' && targetIndex < 0) return entries
    next.splice(targetId === 'root' ? next.length : targetIndex + Number(after), 0, active)
    return next
  }
  if (!activeId.startsWith('server:')) return entries
  const serverId = activeId.slice(7)
  const exists = entries.some((entry) =>
    entry.type === 'server' ? entry.serverId === serverId : entry.serverIds.includes(serverId)
  )
  if (!exists) return entries
  if (targetId === 'root') return moveServer(entries, serverId, null)
  const folder = entries.find((entry) => entry.type === 'folder' && `folder:${entry.id}` === targetId)
  if (folder?.type === 'folder') return moveServer(entries, serverId, folder.id)
  for (const entry of entries) {
    if (entry.type === 'folder' && entry.serverIds.some((id) => `server:${id}` === targetId)) {
      const siblings = entry.serverIds.filter((id) => id !== serverId)
      const index = siblings.findIndex((id) => `server:${id}` === targetId)
      return moveServer(entries, serverId, entry.id, index + Number(after))
    }
  }
  const siblings = entries.filter((entry) => entry.type !== 'server' || entry.serverId !== serverId)
  const index = siblings.findIndex((entry) => layoutEntryId(entry) === targetId)
  return index < 0 ? entries : moveServer(entries, serverId, null, index + Number(after))
}

export function removeFolder(entries: ServerLayoutEntry[], folderId: string): ServerLayoutEntry[] {
  return entries.flatMap<ServerLayoutEntry>((entry) =>
    entry.type === 'folder' && entry.id === folderId
      ? entry.serverIds.map((serverId) => ({ type: 'server', serverId }))
      : [entry]
  )
}
