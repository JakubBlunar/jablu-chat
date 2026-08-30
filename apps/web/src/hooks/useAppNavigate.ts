import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useNavHistoryStore } from '@/stores/navHistory.store'
import { useNavigationStore } from '@/stores/navigation.store'

export function useAppNavigate() {
  const navigate = useNavigate()

  const goToServer = useCallback((serverId: string) => navigate(`/channels/${serverId}`), [navigate])

  const goToChannel = useCallback(
    (serverId: string, channelId: string) => navigate(`/channels/${serverId}/${channelId}`),
    [navigate]
  )

  /**
   * The DM rail button. Reopens whichever DM screen the user last had open,
   * which may legitimately be the friends list.
   */
  const goToDms = useCallback(() => {
    const last = useNavHistoryStore.getState().lastDmScreen
    navigate(last ? `/channels/@me/${last}` : '/channels/@me')
  }, [navigate])

  /** The friends list specifically, ignoring history. */
  const goToFriends = useCallback(() => {
    useNavHistoryStore.getState().recordDmScreen(null)
    navigate('/channels/@me')
  }, [navigate])

  const goToDm = useCallback(
    (conversationId: string) => {
      useNavHistoryStore.getState().recordDmScreen(conversationId)
      navigate(`/channels/@me/${conversationId}`)
    },
    [navigate]
  )

  const orchestratedGoToChannel = useCallback(
    async (serverId: string, channelId?: string | null, scrollToMessageId?: string | null) => {
      const path = await useNavigationStore.getState().navigateToChannel({
        serverId,
        channelId,
        scrollToMessageId
      })
      if (path) navigate(path)
    },
    [navigate]
  )

  const orchestratedGoToDm = useCallback(
    async (conversationId: string, scrollToMessageId?: string | null) => {
      const path = await useNavigationStore.getState().navigateToDm({
        conversationId,
        scrollToMessageId
      })
      if (path) navigate(path)
    },
    [navigate]
  )

  return {
    navigate,
    goToServer,
    goToChannel,
    goToDms,
    goToFriends,
    goToDm,
    orchestratedGoToChannel,
    orchestratedGoToDm
  } as const
}
