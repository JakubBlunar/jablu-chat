import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth.store'
import { useNavHistoryStore } from '@/stores/navHistory.store'

function resolvePath(): string {
  const userId = useAuthStore.getState().user?.id ?? null
  const history = useNavHistoryStore.getState()

  // Entries belong to whoever was last signed in on this install. syncUser
  // wipes them on a mismatch, so this both scopes and self-heals.
  history.syncUser(userId)
  if (!userId) return '/channels/@me'

  const last = useNavHistoryStore.getState().lastLocation
  if (!last) return '/channels/@me'

  if (last.kind === 'dm') {
    return last.conversationId ? `/channels/@me/${last.conversationId}` : '/channels/@me'
  }

  return last.channelId
    ? `/channels/${last.serverId}/${last.channelId}`
    : `/channels/${last.serverId}`
}

/**
 * The landing route. Reopens wherever the user was when they last closed the
 * app rather than always dropping them on the friends list, which matters most
 * on desktop and installed PWA where relaunching is common.
 *
 * A server or channel that no longer exists is handled by MainLayout's
 * existing redirect effects, so a stale entry degrades to today's behaviour.
 */
export function RestoreLastLocation() {
  return <Navigate to={resolvePath()} replace />
}
