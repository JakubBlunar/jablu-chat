import { useEffect, useRef } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import { useChannelStore } from '@/stores/channel.store'
import { useDmStore } from '@/stores/dm.store'
import { useForumStore } from '@/stores/forum.store'
import { useNavHistoryStore } from '@/stores/navHistory.store'
import { useServerStore } from '@/stores/server.store'
import { useThreadStore } from '@/stores/thread.store'
import { useVoiceConnectionStore } from '@/stores/voice-connection.store'

/**
 * One-way sync: URL params → Zustand stores.
 * Call once at the top of MainLayout.
 */
export function useRouteSync() {
  const params = useParams()
  const { pathname } = useLocation()
  const isDm = pathname.startsWith('/channels/@me')

  const serverId = isDm ? null : (params.serverId ?? null)
  const channelId = isDm ? null : (params.channelId ?? null)
  const conversationId = isDm ? (params.conversationId ?? null) : null

  const prevIsDmRef = useRef<boolean | undefined>(undefined)
  const prevServerRef = useRef<string | null>(null)
  const prevChannelRef = useRef<string | null>(null)
  const prevConvRef = useRef<string | null>(null)

  useEffect(() => {
    if (isDm) {
      const modeChanged = prevIsDmRef.current !== true
      if (modeChanged) {
        useServerStore.getState().setViewMode('dm')
        useThreadStore.getState().closeThread()
        useForumStore.getState().closePost()
        prevIsDmRef.current = true
        prevServerRef.current = null
        prevChannelRef.current = null
      }

      if (modeChanged || prevConvRef.current !== conversationId) {
        prevConvRef.current = conversationId
        useDmStore.getState().setCurrentConversation(conversationId)
        useNavHistoryStore.getState().recordDmScreen(conversationId)
      }
    } else if (serverId) {
      if (prevIsDmRef.current !== false) {
        prevIsDmRef.current = false
        prevConvRef.current = null
      }

      if (prevServerRef.current !== serverId) {
        prevServerRef.current = serverId
        prevChannelRef.current = null
        useServerStore.getState().setCurrentServer(serverId)
        useThreadStore.getState().closeThread()
        useForumStore.getState().closePost()
      }

      if (channelId && prevChannelRef.current !== channelId) {
        prevChannelRef.current = channelId
        useChannelStore.getState().setCurrentChannel(channelId)
        // Also record here so back/forward and deep links are remembered, not
        // just clicks that go through navigation.store. The channel may not be
        // loaded yet on a deep link, in which case navigation.store records it.
        // Voice channels are deliberately not remembered as a landing spot.
        const channel = useChannelStore.getState().channels.find((c) => c.id === channelId)
        const messageable = channel?.type === 'text' || channel?.type === 'forum'
        if (messageable) {
          useNavHistoryStore.getState().recordChannel(serverId, channelId)
        }
        useNavHistoryStore.getState().recordServerLocation(serverId, messageable ? channelId : null)
        const voiceState = useVoiceConnectionStore.getState()
        voiceState.setViewingVoiceRoom(channelId === voiceState.currentChannelId)
      }
    }
  }, [isDm, serverId, channelId, conversationId])
}
