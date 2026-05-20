import { useEffect } from 'react'
import { useReadStateStore } from '@/stores/readState.store'
import { useVoiceConnectionStore } from '@/stores/voice-connection.store'

/**
 * Marks the current channel/DM as read whenever it becomes the active context,
 * when the tab regains visibility, and on context change / unmount.
 *
 * This hook lives in MessageArea so the ack runs on every layout (desktop and
 * mobile PWA). Previously this was wired only inside ChannelSidebar / DmSidebar,
 * which are never mounted on mobile — leaving the unread badge stuck even after
 * the user opened the channel.
 *
 * For channels, the ack is suppressed while the user is viewing a voice room
 * (text channel isn't actually being read in that case).
 */
export function useChannelAck(mode: 'channel' | 'dm', contextId: string | null): void {
  useEffect(() => {
    if (!contextId) return

    const isChannel = mode === 'channel'

    const captureAndAck = () => {
      const rs = useReadStateStore.getState()
      if (isChannel) {
        if (useVoiceConnectionStore.getState().viewingVoiceRoom) return
        rs.captureChannelView(contextId)
        rs.ackChannel(contextId)
      } else {
        rs.captureDmView(contextId)
        rs.ackDm(contextId)
      }
    }

    captureAndAck()

    const onVisibility = () => {
      if (document.visibilityState === 'visible') captureAndAck()
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      const rs = useReadStateStore.getState()
      if (isChannel) {
        if (!useVoiceConnectionStore.getState().viewingVoiceRoom) {
          rs.ackChannel(contextId)
        }
        rs.clearChannelView(contextId)
      } else {
        rs.ackDm(contextId)
        rs.clearDmView(contextId)
      }
    }
  }, [mode, contextId])
}
