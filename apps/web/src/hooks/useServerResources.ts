import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useChannelPermissionsStore } from '@/stores/channel-permissions.store'
import { useChannelStore } from '@/stores/channel.store'
import { useMemberStore } from '@/stores/member.store'
import { useMessageStore } from '@/stores/message.store'
import { useServerStore } from '@/stores/server.store'
import { useNavigationStore } from '@/stores/navigation.store'

/**
 * Loads the data a server view needs once the current server is known.
 *
 * Channels and permissions can already be on screen from the structure cache
 * (cold start hydrate, or a warm switch that went through `navigateToChannel`).
 * Members are not cached that way. Gating the member fetch on a channel cache
 * hit is what left the member list empty until the user switched servers.
 */
export function useServerResources() {
  const navigate = useNavigate()
  const viewMode = useServerStore((s) => s.viewMode)
  const currentServerId = useServerStore((s) => s.currentServerId)
  const navigatingToServerId = useNavigationStore((s) => s.navigatingToServerId)
  const fetchChannels = useChannelStore((s) => s.fetchChannels)
  const channelLoadedServerId = useChannelStore((s) => s.loadedServerId)
  const fetchMembers = useMemberStore((s) => s.fetchMembers)
  const memberLoadedServerId = useMemberStore((s) => s.loadedServerId)
  const clearMessages = useMessageStore((s) => s.clearMessages)
  const prevServerRef = useRef<string | null>(null)

  useEffect(() => {
    if (viewMode !== 'server') return
    // Navigation preloads the next server before changing the visible route.
    // An old view must not restart its reads and cancel that preload.
    if (navigatingToServerId && navigatingToServerId !== currentServerId) return
    if (!currentServerId) {
      prevServerRef.current = null
      clearMessages()
      return
    }

    if (memberLoadedServerId !== currentServerId) {
      void fetchMembers(currentServerId).catch(() => {})
    }

    if (prevServerRef.current !== currentServerId ||
      useChannelStore.getState().requestedServerId !== currentServerId ||
      useChannelPermissionsStore.getState().requestedServerId !== currentServerId) {
      prevServerRef.current = currentServerId
      // Cache hydration does not set requestedServerId; a completed navigation
      // refresh does. This also avoids a second request after the first settles.
      if (useChannelStore.getState().requestedServerId !== currentServerId) {
        fetchChannels(currentServerId).catch(() => {
          if (useServerStore.getState().currentServerId === currentServerId) navigate('/channels/@me', { replace: true })
        })
      }
      if (useChannelPermissionsStore.getState().requestedServerId !== currentServerId) {
        void useChannelPermissionsStore.getState().fetchChannelPermissions(currentServerId)
      }
    }
  }, [
    viewMode,
    currentServerId,
    navigatingToServerId,
    memberLoadedServerId,
    channelLoadedServerId,
    fetchChannels,
    fetchMembers,
    navigate,
    clearMessages
  ])
}
