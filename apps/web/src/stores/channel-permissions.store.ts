import { permsToBigInt } from '@chat/shared'
import { create } from 'zustand'
import { api } from '@/lib/api'

type ChannelPermissionsState = {
  permissionsMap: Record<string, bigint>
  loadedServerId: string | null
  fetchChannelPermissions: (serverId: string) => Promise<void>
  clear: () => void
}

export const useChannelPermissionsStore = create<ChannelPermissionsState>((set) => ({
  permissionsMap: {},
  loadedServerId: null,

  fetchChannelPermissions: async (serverId) => {
    try {
      const wire = await api.getAllChannelPermissions(serverId)
      const map: Record<string, bigint> = {}
      for (const [chId, permsStr] of Object.entries(wire)) {
        map[chId] = permsToBigInt(permsStr)
      }
      set({ permissionsMap: map, loadedServerId: serverId })
    } catch {
      /* leave stale cache on error */
    }
  },

  clear: () => set({ permissionsMap: {}, loadedServerId: null }),
}))
