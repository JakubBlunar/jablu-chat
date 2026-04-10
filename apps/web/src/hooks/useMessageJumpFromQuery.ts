import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useChannelStore } from '@/stores/channel.store'
import { useDmStore } from '@/stores/dm.store'
import { useNavigationStore } from '@/stores/navigation.store'
import { useServerStore } from '@/stores/server.store'

/**
 * Reads `?m=<messageId>` on channel or DM routes and scrolls to that message, then strips the param.
 */
export function useMessageJumpFromQuery() {
  const [searchParams, setSearchParams] = useSearchParams()
  const jumpId = searchParams.get('m')

  const viewMode = useServerStore((s) => s.viewMode)
  const serverId = useServerStore((s) => s.currentServerId)
  const channelId = useChannelStore((s) => s.currentChannelId)
  const conversationId = useDmStore((s) => s.currentConversationId)

  useEffect(() => {
    if (!jumpId) return

    let cancelled = false

    void (async () => {
      if (viewMode === 'dm' && conversationId) {
        await useNavigationStore.getState().navigateToDm({
          conversationId,
          scrollToMessageId: jumpId
        })
        if (cancelled) return
        setSearchParams(
          (prev) => {
            const next = new URLSearchParams(prev)
            next.delete('m')
            return next
          },
          { replace: true }
        )
      } else if (viewMode === 'server' && serverId && channelId) {
        await useNavigationStore.getState().navigateToChannel({
          serverId,
          channelId,
          scrollToMessageId: jumpId
        })
        if (cancelled) return
        setSearchParams(
          (prev) => {
            const next = new URLSearchParams(prev)
            next.delete('m')
            return next
          },
          { replace: true }
        )
      }
    })()

    return () => {
      cancelled = true
    }
  }, [jumpId, viewMode, serverId, channelId, conversationId, setSearchParams])
}
