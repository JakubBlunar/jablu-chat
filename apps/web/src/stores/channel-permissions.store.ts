import { permsToBigInt } from '@chat/shared'
import { create } from 'zustand'
import { api } from '@/lib/api'
import { getPermissions, putPermissions } from '@/lib/cache/structureCache'

type ChannelPermissionsState = {
  permissionsMap: Record<string, bigint>
  loadedServerId: string | null
  fetchChannelPermissions: (serverId: string) => Promise<void>
  hydrateFromCache: (serverId: string) => boolean
  clear: () => void
}

function toBigIntMap(wire: Record<string, string>): Record<string, bigint> {
  const map: Record<string, bigint> = {}
  for (const [channelId, perms] of Object.entries(wire)) {
    map[channelId] = permsToBigInt(perms)
  }
  return map
}

export const useChannelPermissionsStore = create<ChannelPermissionsState>((set) => ({
  permissionsMap: {},
  loadedServerId: null,

  // Cached as wire strings rather than bigints, which do not survive JSON.
  hydrateFromCache: (serverId) => {
    const entry = getPermissions(serverId)
    if (!entry) return false
    set({ permissionsMap: toBigIntMap(entry.permissions), loadedServerId: serverId })
    return true
  },

  fetchChannelPermissions: async (serverId) => {
    try {
      const wire = await api.getAllChannelPermissions(serverId)
      putPermissions(serverId, wire)
      set({ permissionsMap: toBigIntMap(wire), loadedServerId: serverId })
    } catch {
      /* leave stale cache on error */
    }
  },

  clear: () => set({ permissionsMap: {}, loadedServerId: null }),
}))
