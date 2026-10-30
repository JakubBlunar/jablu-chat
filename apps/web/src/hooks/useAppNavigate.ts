import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useNavHistoryStore } from '@/stores/navHistory.store'
import { openConversation, parseConversationPath } from '@/lib/conversationNavigation'

/** Thin UI conveniences; all conversation requests use the same coordinator. */
export function useAppNavigate() {
  const routerNavigate = useNavigate()
  const navigate = useCallback(
    (path: string) => {
      const request = parseConversationPath(path)
      if (request) void openConversation(request)
      else routerNavigate(path)
    },
    [routerNavigate]
  )
  const goToChannel = useCallback(
    (serverId: string, channelId?: string | null, messageId?: string | null) =>
      openConversation({
        target: channelId ? { kind: 'channel', serverId, channelId } : { kind: 'server', serverId },
        position: messageId ? { kind: 'message', messageId } : { kind: 'unread' },
        source: 'sidebar'
      }),
    []
  )
  const goToServer = useCallback((serverId: string) => goToChannel(serverId), [goToChannel])
  const goToDm = useCallback(
    (conversationId: string, messageId?: string | null) =>
      openConversation({
        target: { kind: 'dm', conversationId },
        position: messageId ? { kind: 'message', messageId } : { kind: 'unread' },
        source: 'sidebar'
      }),
    []
  )
  const goToDms = useCallback(() => {
    const last = useNavHistoryStore.getState().lastDmScreen
    return openConversation({ target: last ? { kind: 'dm', conversationId: last } : { kind: 'home' } })
  }, [])
  const goToFriends = useCallback(() => openConversation({ target: { kind: 'home' } }), [])
  return { navigate, goToServer, goToChannel, goToDms, goToFriends, goToDm } as const
}
