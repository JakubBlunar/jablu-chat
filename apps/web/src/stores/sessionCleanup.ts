type Cleanup = () => void | Promise<void>

export interface SessionCleanupStep {
  name: string
  load: () => Promise<Cleanup>
}

function step<T>(name: string, load: () => Promise<T>, reset: (module: T) => void | Promise<void>): SessionCleanupStep {
  return {
    name,
    load: async () => {
      const module = await load()
      return () => reset(module)
    }
  }
}

const sessionCleanupSteps: SessionCleanupStep[] = [
  step('composer draft persistence', () => import('./draft.store'), ({ flushDraftPersistence }) => { flushDraftPersistence() }),
  step(
    'voice connection',
    () => import('./voice-connection.store'),
    ({ useVoiceConnectionStore }) => useVoiceConnectionStore.getState().disconnect()
  ),
  step(
    'DM calls',
    () => import('./dmCall.store'),
    ({ useDmCallStore }) => useDmCallStore.getState().reset()
  ),
  step(
    'realtime connection',
    () => import('@/lib/socket'),
    ({ disconnectSocket }) => disconnectSocket()
  ),
  step(
    'cache persistence listeners',
    () => import('@/lib/cache/persistence'),
    ({ stopCachePersistence }) => stopCachePersistence()
  ),
  step(
    'activity',
    () => import('./activity.store'),
    ({ useActivityStore }) => useActivityStore.getState().reset()
  ),
  step(
    'server organization',
    () => import('./serverLayout.store'),
    ({ useServerLayoutStore }) => useServerLayoutStore.getState().reset()
  ),
  step(
    'servers',
    () => import('./server.store'),
    ({ useServerStore }) =>
      useServerStore.setState({ servers: [], currentServerId: null, viewMode: 'server', isLoading: false })
  ),
  step(
    'channels',
    () => import('./channel.store'),
    ({ useChannelStore }) => useChannelStore.getState().clear()
  ),
  step(
    'members',
    () => import('./member.store'),
    ({ useMemberStore }) => useMemberStore.getState().clear()
  ),
  step(
    'messages',
    () => import('./message.store'),
    ({ useMessageStore }) => useMessageStore.getState().clearMessages()
  ),
  step(
    'direct messages',
    () => import('./dm.store'),
    ({ useDmStore }) => {
      useDmStore.getState().clearMessages()
      useDmStore.setState({
        conversations: [],
        currentConversationId: null,
        isConversationsLoading: false,
        conversationsError: null,
        scrollToMessageId: null,
        scrollRequestNonce: 0
      })
    }
  ),
  step(
    'threads',
    () => import('./thread.store'),
    ({ useThreadStore }) => {
      useThreadStore.getState().closeThread()
      useThreadStore.setState({ scrollRequestNonce: 0 })
    }
  ),
  step(
    'forum replies',
    () => import('./forumReply.store'),
    ({ useForumReplyStore }) => {
      useForumReplyStore.getState().clearMessages()
      useForumReplyStore.setState({ channelId: null, postId: null, scrollRequestNonce: 0 })
    }
  ),
  step(
    'forums',
    () => import('./forum.store'),
    ({ useForumStore }) => useForumStore.getState().reset()
  ),
  step(
    'bookmarks',
    () => import('./bookmark.store'),
    ({ useBookmarkStore }) => useBookmarkStore.setState({ bookmarkedIds: new Set(), loaded: false })
  ),
  step(
    'Inbox',
    () => import('./inbox.store'),
    ({ useInboxStore }) => useInboxStore.getState().reset()
  ),
  step(
    'notifications',
    () => import('./notificationCenter.store'),
    ({ useNotificationCenterStore }) => useNotificationCenterStore.getState().reset()
  ),
  step(
    'read state',
    () => import('./readState.store'),
    ({ useReadStateStore }) =>
      useReadStateStore.getState().reset()
  ),
  step(
    'notification preferences',
    () => import('./notifPref.store'),
    ({ useNotifPrefStore }) => useNotifPrefStore.setState({ prefs: {}, serverPrefs: {} })
  ),
  step(
    'voice participants',
    () => import('./voice.store'),
    ({ useVoiceStore }) => useVoiceStore.getState().reset()
  ),
  step(
    'layout',
    () => import('./layout.store'),
    ({ useLayoutStore }) => useLayoutStore.setState({ navDrawerOpen: false, memberDrawerOpen: false })
  ),
  step(
    'navigation',
    () => import('./navigation.store'),
    ({ useNavigationStore }) =>
      useNavigationStore.setState({ isNavigating: false, navigatingToServerId: null, activeNavId: 0 })
  ),
  step(
    'events',
    () => import('./event.store'),
    ({ useEventStore }) => useEventStore.getState().reset()
  ),
  step(
    'channel permissions',
    () => import('./channel-permissions.store'),
    ({ useChannelPermissionsStore }) => useChannelPermissionsStore.getState().clear()
  ),
  step(
    'navigation history',
    () => import('./navHistory.store'),
    ({ useNavHistoryStore }) => useNavHistoryStore.getState().syncUser(null)
  ),
  step(
    'message cache',
    () => import('@/lib/cache/messageCache'),
    ({ clearCache }) => clearCache(false)
  ),
  step(
    'structure cache',
    () => import('@/lib/cache/structureCache'),
    ({ clearStructureCache }) => clearStructureCache(false)
  ),
  step(
    'persisted cache',
    () => import('@/lib/cache/persistence'),
    ({ purgeCache }) => purgeCache()
  )
]

/**
 * Stop producers before clearing session state and caches. Drafts and the
 * account-scoped outbox are intentionally not part of session cleanup.
 */
export async function cleanupSession(
  isCurrent: () => boolean,
  steps: readonly SessionCleanupStep[] = sessionCleanupSteps
): Promise<void> {
  const errors: Error[] = []
  for (const { name, load } of steps) {
    if (!isCurrent()) break
    try {
      const cleanup = await load()
      if (!isCurrent()) break
      await cleanup()
    } catch (cause) {
      errors.push(new Error(`Failed to clean up ${name}`, { cause }))
    }
  }
  if (errors.length) throw new AggregateError(errors, 'Session cleanup failed')
}
