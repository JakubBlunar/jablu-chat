import { hasPermission, Permission, permsToBigInt } from '@chat/shared'
import { create } from 'zustand'
import { channelKey, evictContext } from '@/lib/cache/messageCache'
import { api } from '@/lib/api'
import { evictServer, forgetServerHistory, getPermissions, putPermissions } from '@/lib/cache/structureCache'
import { useMessageStore } from './message.store'
import { createActiveResourceRequest } from '@/lib/activeResourceRequest'

const permissionRequests = createActiveResourceRequest<Record<string, string>>()

type ChannelPermissionsState = {
  permissionsMap: Record<string, bigint>
  loadedServerId: string | null
  requestedServerId: string | null
  fetchChannelPermissions: (serverId: string, fresh?: boolean) => Promise<void>
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
  requestedServerId: null,

  // Cached as wire strings rather than bigints, which do not survive JSON.
  hydrateFromCache: (serverId) => {
    const entry = getPermissions(serverId)
    if (!entry) return false
    set({ permissionsMap: toBigIntMap(entry.permissions), loadedServerId: serverId })
    return true
  },

  fetchChannelPermissions: (serverId, fresh = false) => {
    if (fresh) evictServer(serverId)
    return permissionRequests.run(serverId,
    (signal) => api.getAllChannelPermissions(serverId, { signal }), {
    start: () => set((s) => ({ requestedServerId: serverId, ...(s.loadedServerId !== serverId || fresh ? {
      permissionsMap: toBigIntMap(getPermissions(serverId)?.permissions ?? {}), loadedServerId: serverId
    } : {}) })),
    commit: (wire) => {
      const permissionsMap = toBigIntMap(wire)
      for (const [id, bits] of Object.entries(permissionsMap)) {
        if (hasPermission(bits, Permission.VIEW_CHANNEL)) continue
        evictContext(channelKey(id))
        const history = useMessageStore.getState()
        if (history.loadedForChannelId === id) history.clearMessages()
      }
      putPermissions(serverId, wire)
      set({ permissionsMap, loadedServerId: serverId })
    },
    fail: (error) => {
      if ([401, 403, 404].includes((error as { status?: number })?.status ?? 0)) {
        forgetServerHistory(serverId)
        set({ permissionsMap: {} })
      }
    },
    ignoreErrors: true
    }, fresh)
  },

  clear: () => {
    permissionRequests.cancel()
    set({ permissionsMap: {}, loadedServerId: null, requestedServerId: null })
  },
}))
