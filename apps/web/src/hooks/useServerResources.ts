import { useEffect } from 'react'
import { useMemberStore } from '@/stores/member.store'
import { useServerStore } from '@/stores/server.store'
import { useNavigationStore } from '@/stores/navigation.store'

/** Foreground channels/permissions/history belong to the coordinator.
 * This hook fills only the optional member panel for the committed selection. */
export function useServerResources() {
  const viewMode = useServerStore((state) => state.viewMode)
  const serverId = useServerStore((state) => state.currentServerId)
  const loading = useNavigationStore((state) => state.isNavigating)
  const loaded = useMemberStore((state) => state.loadedServerId)
  const fetchMembers = useMemberStore((state) => state.fetchMembers)
  useEffect(() => {
    if (loading || viewMode !== 'server' || !serverId || loaded === serverId) return
    if (useServerStore.getState().currentServerId !== serverId) return
    void fetchMembers(serverId).catch(() => {})
  }, [loading, viewMode, serverId, loaded, fetchMembers])
}
