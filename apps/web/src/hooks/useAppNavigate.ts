import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useNavigationStore } from '@/stores/navigation.store'

export function useAppNavigate() {
  const navigate = useNavigate()

  const goToServer = useCallback((serverId: string) => navigate(`/channels/${serverId}`), [navigate])

  const goToChannel = useCallback(
    (serverId: string, channelId: string) => navigate(`/channels/${serverId}/${channelId}`),
    [navigate]
  )

  const goToDms = useCallback(() => navigate('/channels/@me'), [navigate])

  const goToDm = useCallback((conversationId: string) => navigate(`/channels/@me/${conversationId}`), [navigate])

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

  return { navigate, goToServer, goToChannel, goToDms, goToDm, orchestratedGoToChannel, orchestratedGoToDm } as const
}
