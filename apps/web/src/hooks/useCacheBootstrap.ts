import { useEffect } from 'react'
import { hydrateServerListFromDisk, hydrateServerStructureFromDisk } from '@/lib/cache/hydrate'
import { startCachePersistence } from '@/lib/cache/persistence'
import { useChannelPermissionsStore } from '@/stores/channel-permissions.store'
import { useChannelStore } from '@/stores/channel.store'
import { useNavHistoryStore } from '@/stores/navHistory.store'
import { useServerStore } from '@/stores/server.store'

/**
 * Fills the sidebar from disk on a cold start, then lets the normal fetches
 * overwrite it.
 *
 * Every step re-checks that the store is still empty before applying, because
 * this races the network deliberately: whichever arrives first wins, and the
 * network is authoritative when it does.
 */
export function useCacheBootstrap(userId: string | null) {
  useEffect(() => {
    let cancelled = false

    void (async () => {
      await startCachePersistence(userId)
      if (cancelled || !userId) return

      await hydrateServerListFromDisk()
      if (cancelled) return
      if (useServerStore.getState().servers.length === 0) {
        useServerStore.getState().hydrateFromCache()
      }

      const last = useNavHistoryStore.getState().lastLocation
      if (last?.kind !== 'server') return

      await hydrateServerStructureFromDisk(last.serverId)
      if (cancelled) return
      if (!useChannelStore.getState().loadedServerId) {
        useChannelStore.getState().hydrateFromCache(last.serverId)
      }
      if (!useChannelPermissionsStore.getState().loadedServerId) {
        useChannelPermissionsStore.getState().hydrateFromCache(last.serverId)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [userId])
}
