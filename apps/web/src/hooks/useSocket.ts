import { useEffect, useState } from 'react'
import i18n from 'i18next'
import { api } from '@/lib/api'
import { getAppVisibilityState, subscribeAppVisibility } from '@/lib/appVisibility'
import { markAllStale } from '@/lib/cache/messageCache'
import { clearNotifications } from '@/lib/notifications'
import { connectSocket, disconnectSocket, getSocket } from '@/lib/socket'
import { useAuthStore } from '@/stores/auth.store'
import { isAppLocale } from '@/i18n/locales'
import { showToast } from '@/stores/toast.store'
import { useChannelPermissionsStore } from '@/stores/channel-permissions.store'
import { useChannelStore } from '@/stores/channel.store'
import { useDmStore } from '@/stores/dm.store'
import { useMemberStore } from '@/stores/member.store'
import { useMessageStore } from '@/stores/message.store'
import { useServerStore } from '@/stores/server.store'
import { useNotificationCenterStore } from '@/stores/notificationCenter.store'
import { useInboxStore } from '@/stores/inbox.store'
import { useVoiceConnectionStore } from '@/stores/voice-connection.store'
import { useDmCallStore } from '@/stores/dmCall.store'
import { createChannelHandlers } from './socket/channelHandlers'
import { createDmHandlers } from './socket/dmHandlers'
import { createPresenceHandlers } from './socket/presenceHandlers'
import { createServerHandlers } from './socket/serverHandlers'
import { createVoiceHandlers } from './socket/voiceHandlers'
import { startMessageOutbox } from '@/lib/messageOutbox'
import { requestReadStateRefresh, cancelReadStateRefresh } from '@/lib/readStateRefresh'

export function useSocket(): { socket: ReturnType<typeof getSocket>; isConnected: boolean } {
  const accessToken = useAuthStore((s) => s.accessToken)
  const userId = useAuthStore((s) => s.user?.id)
  const [isConnected, setIsConnected] = useState(false)

  useEffect(() => {
    if (!accessToken) {
      disconnectSocket()
      setIsConnected(false)
      return
    }

    const socket = connectSocket(accessToken)

    let handlingAuthError = false
    let hasConnectedBefore = false
    // Also resync from the user room for cross-device reads and missed messages.
    const throttledReadStateSync = requestReadStateRefresh

    const syncMessages = () => {
      const channelId = useChannelStore.getState().currentChannelId
      if (channelId) {
        socket.emit('channel:join', { channelId })
        const msgStore = useMessageStore.getState()
        if (!msgStore.isLoading && !msgStore.hasNewer) {
          if (msgStore.loadedForChannelId !== channelId || !msgStore.messages.length) {
            msgStore.fetchMessages(channelId).catch(() => {})
          } else {
            msgStore.fetchNewerMessages(channelId).catch(() => {})
          }
        }
      }
      const convId = useDmStore.getState().currentConversationId
      if (convId) {
        socket.emit('dm:join', { conversationId: convId })
        const dmStore = useDmStore.getState()
        if (!dmStore.isLoading && !dmStore.hasNewer) {
          if (dmStore.loadedForConvId !== convId || !dmStore.messages.length) {
            dmStore.fetchMessages(convId).catch(() => {})
          } else {
            dmStore.fetchNewerMessages(convId).catch(() => {})
          }
        }
      }
    }

    const onConnect = () => {
      setIsConnected(true)
      // Only the selected histories are caught up now. Other cached channels
      // and DMs must be checked when opened, including after token refresh.
      markAllStale()
      void useDmStore.getState().fetchConversations()
      void useDmCallStore.getState().sync()
      syncMessages()

      if (hasConnectedBefore) {
        useServerStore
          .getState()
          .fetchServers()
          .catch(() => {})

        const currentServerId = useServerStore.getState().currentServerId
        if (currentServerId) {
          useChannelStore
            .getState()
            .fetchChannels(currentServerId, true)
            .catch(() => {})
          useMemberStore
            .getState()
            .fetchMembers(currentServerId)
            .catch(() => {})
          useChannelPermissionsStore
            .getState()
            .fetchChannelPermissions(currentServerId, true)
            .catch(() => {})
        }
      }
      hasConnectedBefore = true
      useInboxStore.getState().bump()

      if (!document.hidden || useVoiceConnectionStore.getState().room) {
        socket.emit('activity:heartbeat')
      }

      // Catch up on anything that landed while this client was asleep or offline.
      void useNotificationCenterStore.getState().fetchUnread()
      throttledReadStateSync()
    }
    const onDisconnect = () => {
      setIsConnected(false)
      markAllStale()
      const wasInCall = !!useVoiceConnectionStore.getState().currentDmCallId
      if (wasInCall) useVoiceConnectionStore.getState().disconnect()
      useDmCallStore.getState().reset()
      if (wasInCall)
        useDmCallStore.setState({ error: i18n.t('voice.callDisconnected') })
    }
    const onConnectError = async () => {
      if (handlingAuthError) return
      const store = useAuthStore.getState()
      if (!store.isAuthenticated) return
      handlingAuthError = true
      try {
        await store.refreshSession()
        const newToken = useAuthStore.getState().accessToken
        if (newToken) {
          // Merge, don't replace: the handshake also carries the device id and
          // visibility that seed the server's push gate.
          socket.auth = { ...(socket.auth as Record<string, unknown>), token: newToken }
        }
      } catch (err: unknown) {
        const status = (err as { status?: number }).status
        if (status === 401 || status === 403) {
          socket.disconnect()
          api.onAuthFailure?.()
        }
      } finally {
        handlingAuthError = false
      }
    }

    const ch = createChannelHandlers()
    const dm = createDmHandlers()
    const presence = createPresenceHandlers()
    const voice = createVoiceHandlers()
    const srv = createServerHandlers()

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('connect_error', onConnectError)
    socket.on('message:new', ch.onMessageNew)
    socket.on('message:edit', ch.onMessageEdit)
    socket.on('message:delete', ch.onMessageDelete)
    socket.on('user:online', presence.onUserOnline)
    socket.on('user:offline', presence.onUserOffline)
    socket.on('user:status', presence.onUserStatus)
    socket.on('user:custom-status', presence.onUserCustomStatus)
    socket.on('user:activity', presence.onUserActivity)
    socket.on('activity:init', presence.onActivityInit)
    socket.on('activity:preferences-changed', presence.onActivityPreferencesChanged)
    socket.on('disconnect', presence.onActivityDisconnect)
    socket.on('member:joined', presence.onMemberJoined)
    socket.on('user:typing', ch.onUserTyping)
    socket.on('user:typing-stop', ch.onUserTypingStop)
    socket.on('reaction:add', ch.onReactionAdd)
    socket.on('reaction:remove', ch.onReactionRemove)
    socket.on('message:pin', ch.onMessagePin)
    socket.on('message:unpin', ch.onMessageUnpin)
    socket.on('message:link-previews', ch.onLinkPreviews)
    socket.on('presence:init', presence.onPresenceInit)
    socket.on('friends:presence', presence.onFriendsPresence)
    socket.on('dm:new', dm.onDmNew)
    socket.on('dm:conversation-refresh', dm.onDmConversationRefresh)
    socket.on('dm:conversation-removed', dm.onDmConversationRemoved)
    socket.on('dm:read-state-refresh', dm.onDmReadStateRefresh)
    socket.on('dm:edit', dm.onDmEdit)
    socket.on('dm:delete', dm.onDmDelete)
    socket.on('dm:pin', dm.onDmPin)
    socket.on('dm:unpin', dm.onDmUnpin)
    socket.on('poll:vote', ch.onPollVote)
    socket.on('message:thread-update', ch.onThreadUpdate)
    socket.on('message:new', ch.onNewMessageForThread)
    socket.on('dm:typing', dm.onDmTyping)
    socket.on('dm:call:update', useDmCallStore.getState().update)
    socket.on('dm:call:ended', useDmCallStore.getState().ended)
    socket.on('dm:link-previews', dm.onDmLinkPreviews)
    socket.on('voice:participants', voice.onVoiceParticipants)
    socket.on('voice:participant-joined', voice.onVoiceParticipantJoined)
    socket.on('voice:participant-left', voice.onVoiceParticipantLeft)
    socket.on('voice:participant-state', voice.onVoiceParticipantState)
    socket.on('voice:moved', voice.onVoiceMoved)
    socket.on('channel:reorder', ch.onChannelReorder)
    socket.on('forum:post:created', ch.onForumPostCreated)
    socket.on('forum:post:updated', ch.onForumPostUpdated)
    socket.on('forum:post:deleted', ch.onForumPostDeleted)
    socket.on('event:created', srv.onEventCreated)
    socket.on('event:updated', srv.onEventUpdated)
    socket.on('event:cancelled', srv.onEventCancelled)
    socket.on('event:completed', srv.onEventCompleted)
    socket.on('event:started', srv.onEventStarted)
    socket.on('event:interest', srv.onEventInterest)
    socket.on('member:left', srv.onMemberLeft)
    socket.on('member:updated', srv.onMemberUpdated)
    socket.on('member:timeout', srv.onMemberTimeout)
    socket.on('channel:permissions:updated', srv.onChannelPermissionsUpdated)
    socket.on('role:created', srv.onRoleCreated)
    socket.on('role:updated', srv.onRoleUpdated)
    socket.on('role:deleted', srv.onRoleDeleted)
    socket.on('roles:reordered', srv.onRolesReordered)
    socket.on('channel:created', srv.onChannelCreated)
    socket.on('channel:updated', srv.onChannelUpdated)
    socket.on('channel:deleted', srv.onChannelDeleted)
    socket.on('category:created', srv.onCategoryCreated)
    socket.on('category:updated', srv.onCategoryUpdated)
    socket.on('category:deleted', srv.onCategoryDeleted)
    socket.on('category:reorder', srv.onCategoryReorder)
    socket.on('server:updated', srv.onServerUpdated)
    const onUserLocale = (data: { userId?: unknown; locale?: unknown }) => {
      const user = useAuthStore.getState().user
      if (
        !user ||
        data.userId !== user.id ||
        typeof data.locale !== 'string' ||
        !isAppLocale(data.locale)
      ) {
        return
      }
      useAuthStore.getState().setUser({ ...user, locale: data.locale })
    }
    socket.on('user:locale', onUserLocale)
    socket.on('user:profile', srv.onUserProfile)
    socket.on('friend:request', srv.onFriendRequest)
    socket.on('friend:accepted', srv.onFriendAccepted)
    socket.on('friend:declined', srv.onFriendDeclined)
    socket.on('friend:cancelled', srv.onFriendCancelled)
    socket.on('friend:removed', srv.onFriendRemoved)

    const onBotCommandError = (data: { error?: string }) => {
      showToast(i18n.t('chat:commandFailed'), data.error ?? i18n.t('chat:commandCouldNotRun'))
    }
    socket.on('bot:command-error', onBotCommandError)

    const onInAppNotificationNew = () => {
      useNotificationCenterStore.getState().applySocketBump()
      useInboxStore.getState().bump()
      throttledReadStateSync()
    }
    socket.on('in_app_notification:new', onInAppNotificationNew)
    const onInboxActivity = () => useInboxStore.getState().bump()
    socket.on('message:new', onInboxActivity)
    socket.on('dm:new', onInboxActivity)

    // Sent when the user reads something on any of their devices, so this one
    // can take its now-stale toast down.
    const onNotificationClear = (data: { urls: string[] | null }) => {
      void clearNotifications(data.urls)
    }
    socket.on('notification:clear', onNotificationClear)

    // A tray-hidden WebView can keep document.visibilityState === 'visible'.
    // Use the shared native-aware state, and recover even if Socket.IO has not
    // noticed a stale connection yet. Focus changes alone do not resync.
    let previousVisibility = getAppVisibilityState().visibility
    const unsubscribeVisibility = subscribeAppVisibility(({ visibility }) => {
      const resumed = previousVisibility === 'hidden' && visibility === 'visible'
      previousVisibility = visibility
      if (!resumed) return
      markAllStale()
      if (!socket.connected) {
        socket.connect()
        return
      }
      syncMessages()
      void useDmStore.getState().fetchConversations()
      void useDmCallStore.getState().sync()
      void useNotificationCenterStore.getState().fetchUnread()
      throttledReadStateSync()
      useInboxStore.getState().bump()
    })

    setIsConnected(socket.connected)
    const stopOutbox = userId ? startMessageOutbox(socket, userId) : undefined

    return () => {
      stopOutbox?.()
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('connect_error', onConnectError)
      socket.off('message:new', ch.onMessageNew)
      socket.off('message:edit', ch.onMessageEdit)
      socket.off('message:delete', ch.onMessageDelete)
      socket.off('user:online', presence.onUserOnline)
      socket.off('user:offline', presence.onUserOffline)
      socket.off('user:status', presence.onUserStatus)
      socket.off('user:custom-status', presence.onUserCustomStatus)
      socket.off('user:activity', presence.onUserActivity)
      socket.off('activity:init', presence.onActivityInit)
      socket.off('activity:preferences-changed', presence.onActivityPreferencesChanged)
      socket.off('disconnect', presence.onActivityDisconnect)
      socket.off('member:joined', presence.onMemberJoined)
      socket.off('user:typing', ch.onUserTyping)
      socket.off('user:typing-stop', ch.onUserTypingStop)
      socket.off('reaction:add', ch.onReactionAdd)
      socket.off('reaction:remove', ch.onReactionRemove)
      socket.off('message:pin', ch.onMessagePin)
      socket.off('message:unpin', ch.onMessageUnpin)
      socket.off('message:link-previews', ch.onLinkPreviews)
      socket.off('presence:init', presence.onPresenceInit)
      socket.off('friends:presence', presence.onFriendsPresence)
      socket.off('dm:new', dm.onDmNew)
      socket.off('dm:conversation-refresh', dm.onDmConversationRefresh)
      socket.off('dm:conversation-removed', dm.onDmConversationRemoved)
      socket.off('dm:read-state-refresh', dm.onDmReadStateRefresh)
      socket.off('dm:edit', dm.onDmEdit)
      socket.off('dm:delete', dm.onDmDelete)
      socket.off('dm:pin', dm.onDmPin)
      socket.off('dm:unpin', dm.onDmUnpin)
      socket.off('poll:vote', ch.onPollVote)
      socket.off('message:thread-update', ch.onThreadUpdate)
      socket.off('message:new', ch.onNewMessageForThread)
      socket.off('dm:typing', dm.onDmTyping)
      socket.off('dm:call:update', useDmCallStore.getState().update)
      socket.off('dm:call:ended', useDmCallStore.getState().ended)
      socket.off('dm:link-previews', dm.onDmLinkPreviews)
      socket.off('voice:participants', voice.onVoiceParticipants)
      socket.off('voice:participant-joined', voice.onVoiceParticipantJoined)
      socket.off('voice:participant-left', voice.onVoiceParticipantLeft)
      socket.off('voice:participant-state', voice.onVoiceParticipantState)
      socket.off('voice:moved', voice.onVoiceMoved)
      socket.off('channel:reorder', ch.onChannelReorder)
      socket.off('forum:post:created', ch.onForumPostCreated)
      socket.off('forum:post:updated', ch.onForumPostUpdated)
      socket.off('forum:post:deleted', ch.onForumPostDeleted)
      socket.off('event:created', srv.onEventCreated)
      socket.off('event:updated', srv.onEventUpdated)
      socket.off('event:cancelled', srv.onEventCancelled)
      socket.off('event:completed', srv.onEventCompleted)
      socket.off('event:started', srv.onEventStarted)
      socket.off('event:interest', srv.onEventInterest)
      socket.off('member:left', srv.onMemberLeft)
      socket.off('member:updated', srv.onMemberUpdated)
      socket.off('member:timeout', srv.onMemberTimeout)
      socket.off('channel:permissions:updated', srv.onChannelPermissionsUpdated)
      socket.off('channel:created', srv.onChannelCreated)
      socket.off('channel:updated', srv.onChannelUpdated)
      socket.off('channel:deleted', srv.onChannelDeleted)
      socket.off('category:created', srv.onCategoryCreated)
      socket.off('category:updated', srv.onCategoryUpdated)
      socket.off('category:deleted', srv.onCategoryDeleted)
      socket.off('category:reorder', srv.onCategoryReorder)
      socket.off('server:updated', srv.onServerUpdated)
      socket.off('user:locale', onUserLocale)
      socket.off('user:profile', srv.onUserProfile)
      socket.off('friend:request', srv.onFriendRequest)
      socket.off('friend:accepted', srv.onFriendAccepted)
      socket.off('friend:declined', srv.onFriendDeclined)
      socket.off('friend:cancelled', srv.onFriendCancelled)
      socket.off('friend:removed', srv.onFriendRemoved)
      socket.off('bot:command-error', onBotCommandError)
      socket.off('in_app_notification:new', onInAppNotificationNew)
      socket.off('message:new', onInboxActivity)
      socket.off('dm:new', onInboxActivity)
      socket.off('notification:clear', onNotificationClear)
      unsubscribeVisibility()
      cancelReadStateRefresh()
      presence.cleanup()
      if (useVoiceConnectionStore.getState().currentDmCallId) useVoiceConnectionStore.getState().disconnect()
      useDmCallStore.getState().reset()
      disconnectSocket()
      setIsConnected(false)
    }
  }, [accessToken, userId])

  return { socket: getSocket(), isConnected }
}
