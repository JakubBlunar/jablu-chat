import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { conversationPath, parseConversationPath } from '@/lib/conversationTarget'
import { useNavigationStore } from '@/stores/navigation.store'

/** The only Router → conversation bridge. Parsing never starts a second loader. */
export function useRouteSync() {
  const location = useLocation()
  const navigate = useNavigate()
  useEffect(() => () => useNavigationStore.getState().cancelNavigation(), [])
  useEffect(() => {
    const request = parseConversationPath(location.pathname + location.search)
    const state = location.state as { conversationRequestId?: number; conversationConsumedId?: number } | null
    const isCurrent = () => (window.history.state?.key ?? 'default') === location.key
    if (!isCurrent()) return
    if (!request) {
      useNavigationStore.getState().cancelNavigation()
      return
    }
    void useNavigationStore
      .getState()
      .enterRoute(request, {
        key: location.key,
        requestId: state?.conversationRequestId,
        consumedId: state?.conversationConsumedId,
        isCurrent
      })
      .then((outcome) => {
        if (!isCurrent() || outcome.status !== 'opened') return
        const clean = conversationPath(request, false)
        if (clean !== location.pathname + location.search) {
          navigate(clean, {
            replace: true,
            state: { conversationConsumedId: useNavigationStore.getState().activeNavId }
          })
        }
      })
  }, [location.key, location.pathname, location.search, location.state, navigate])
}
