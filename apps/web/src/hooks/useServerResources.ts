import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useChannelPermissionsStore } from '@/stores/channel-permissions.store'
import { useChannelStore } from '@/stores/channel.store'
import { useMemberStore } from '@/stores/member.store'
import { useMessageStore } from '@/stores/message.store'
import { useServerStore } from '@/stores/server.store'

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
  const fetchChannels = useChannelStore((s) => s.fetchChannels)
  const channelLoadedServerId = useChannelStore((s) => s.loadedServerId)
  const fetchMembers = useMemberStore((s) => s.fetchMembers)
  const memberLoadedServerId = useMemberStore((s) => s.loadedServerId)
  const clearMessages = useMessageStore((s) => s.clearMessages)
  const prevServerRef = useRef<string | null>(null)

  useEffect(() => {
    if (viewMode !== 'server') return
    if (!currentServerId) {
      prevServerRef.current = null
      clearMessages()
      return
    }

    if (memberLoadedServerId !== currentServerId) {
      void fetchMembers(currentServerId)
    }

    if (prevServerRef.current !== currentServerId) {
      prevServerRef.current = currentServerId
      if (channelLoadedServerId !== currentServerId) {
        fetchChannels(currentServerId).catch(() => {
          navigate('/channels/@me', { replace: true })
        })
        void useChannelPermissionsStore.getState().fetchChannelPermissions(currentServerId)
      }
    }
  }, [
    viewMode,
    currentServerId,
    memberLoadedServerId,
    channelLoadedServerId,
    fetchChannels,
    fetchMembers,
    navigate,
    clearMessages
  ])
}
