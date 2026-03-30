import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { connectSocket, disconnectSocket, getSocket } from '@/lib/socket'
import { useAuthStore } from '@/stores/auth.store'
import { useChannelPermissionsStore } from '@/stores/channel-permissions.store'
import { useChannelStore } from '@/stores/channel.store'
import { useDmStore } from '@/stores/dm.store'
import { useMemberStore } from '@/stores/member.store'
import { useMessageStore } from '@/stores/message.store'
import { useServerStore } from '@/stores/server.store'
import { useVoiceConnectionStore } from '@/stores/voice-connection.store'
import { createChannelHandlers } from './socket/channelHandlers'
import { createDmHandlers } from './socket/dmHandlers'
import { createPresenceHandlers } from './socket/presenceHandlers'
import { createServerHandlers } from './socket/serverHandlers'
import { createVoiceHandlers } from './socket/voiceHandlers'

export function useSocket(): { socket: ReturnType<typeof getSocket>; isConnected: boolean } {
  const accessToken = useAuthStore((s) => s.accessToken)
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
    let lastAckTs = 0
    const throttledAck = (fn: () => void) => {
      const now = Date.now()
      if (now - lastAckTs > 3000) {
        lastAckTs = now
        fn()
      }
    }
    const onConnect = () => {
      setIsConnected(true)
      const channelId = useChannelStore.getState().currentChannelId
      if (channelId) {
        socket.emit('channel:join', { channelId })
        const msgStore = useMessageStore.getState()
        if (msgStore.loadedForChannelId === channelId && !msgStore.hasNewer) {
          msgStore.fetchNewerMessages(channelId).catch(() => {})
        }
      }
      const convId = useDmStore.getState().currentConversationId
      if (convId) {
        socket.emit('dm:join', { conversationId: convId })
        const dmStore = useDmStore.getState()
        if (dmStore.loadedForConvId === convId && !dmStore.hasNewer) {
          dmStore.fetchNewerMessages(convId).catch(() => {})
        }
      }

      if (hasConnectedBefore) {
        useServerStore.getState().fetchServers().catch(() => {})

        const currentServerId = useServerStore.getState().currentServerId
        if (currentServerId) {
          useChannelStore.getState().fetchChannels(currentServerId).catch(() => {})
          useMemberStore.getState().fetchMembers(currentServerId).catch(() => {})
          useChannelPermissionsStore.getState().fetchChannelPermissions(currentServerId).catch(() => {})
        }

        if (useServerStore.getState().viewMode === 'dm') {
          useDmStore.getState().fetchConversations().catch(() => {})
        }
      }
      hasConnectedBefore = true

      if (!document.hidden || useVoiceConnectionStore.getState().room) {
        socket.emit('activity:heartbeat')
      }
    }
    const onDisconnect = () => setIsConnected(false)
    const onConnectError = async () => {
      if (handlingAuthError) return
      const store = useAuthStore.getState()
      if (!store.isAuthenticated) return
      handlingAuthError = true
      try {
        await store.refreshSession()
        const newToken = useAuthStore.getState().accessToken
        if (newToken) {
          socket.auth = { token: newToken }
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

    const ch = createChannelHandlers(throttledAck)
    const dm = createDmHandlers(throttledAck)
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
    socket.on('dm:edit', dm.onDmEdit)
    socket.on('dm:delete', dm.onDmDelete)
    socket.on('dm:pin', dm.onDmPin)
    socket.on('dm:unpin', dm.onDmUnpin)
    socket.on('poll:vote', ch.onPollVote)
    socket.on('message:thread-update', ch.onThreadUpdate)
    socket.on('message:new', ch.onNewMessageForThread)
    socket.on('dm:typing', dm.onDmTyping)
    socket.on('dm:link-previews', dm.onDmLinkPreviews)
    socket.on('voice:participants', voice.onVoiceParticipants)
    socket.on('voice:participant-joined', voice.onVoiceParticipantJoined)
    socket.on('voice:participant-left', voice.onVoiceParticipantLeft)
    socket.on('voice:participant-state', voice.onVoiceParticipantState)
    socket.on('voice:moved', voice.onVoiceMoved)
    socket.on('channel:reorder', ch.onChannelReorder)
    socket.on('event:created', srv.onEventCreated)
    socket.on('event:updated', srv.onEventUpdated)
    socket.on('event:cancelled', srv.onEventCancelled)
    socket.on('event:completed', srv.onEventCompleted)
    socket.on('event:started', srv.onEventStarted)
    socket.on('event:interest', srv.onEventInterest)
    socket.on('member:left', srv.onMemberLeft)
    socket.on('member:updated', srv.onMemberUpdated)
    socket.on('channel:permissions:updated', srv.onChannelPermissionsUpdated)
    socket.on('channel:created', srv.onChannelCreated)
    socket.on('channel:updated', srv.onChannelUpdated)
    socket.on('channel:deleted', srv.onChannelDeleted)
    socket.on('category:created', srv.onCategoryCreated)
    socket.on('category:updated', srv.onCategoryUpdated)
    socket.on('category:deleted', srv.onCategoryDeleted)
    socket.on('category:reorder', srv.onCategoryReorder)
    socket.on('server:updated', srv.onServerUpdated)
    socket.on('user:profile', srv.onUserProfile)
    socket.on('friend:request', srv.onFriendRequest)
    socket.on('friend:accepted', srv.onFriendAccepted)
    socket.on('friend:declined', srv.onFriendDeclined)
    socket.on('friend:cancelled', srv.onFriendCancelled)
    socket.on('friend:removed', srv.onFriendRemoved)

    setIsConnected(socket.connected)

    return () => {
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
      socket.off('dm:edit', dm.onDmEdit)
      socket.off('dm:delete', dm.onDmDelete)
      socket.off('dm:pin', dm.onDmPin)
      socket.off('dm:unpin', dm.onDmUnpin)
      socket.off('poll:vote', ch.onPollVote)
      socket.off('message:thread-update', ch.onThreadUpdate)
      socket.off('message:new', ch.onNewMessageForThread)
      socket.off('dm:typing', dm.onDmTyping)
      socket.off('dm:link-previews', dm.onDmLinkPreviews)
      socket.off('voice:participants', voice.onVoiceParticipants)
      socket.off('voice:participant-joined', voice.onVoiceParticipantJoined)
      socket.off('voice:participant-left', voice.onVoiceParticipantLeft)
      socket.off('voice:participant-state', voice.onVoiceParticipantState)
      socket.off('voice:moved', voice.onVoiceMoved)
      socket.off('channel:reorder', ch.onChannelReorder)
      socket.off('event:created', srv.onEventCreated)
      socket.off('event:updated', srv.onEventUpdated)
      socket.off('event:cancelled', srv.onEventCancelled)
      socket.off('event:completed', srv.onEventCompleted)
      socket.off('event:started', srv.onEventStarted)
      socket.off('event:interest', srv.onEventInterest)
      socket.off('member:left', srv.onMemberLeft)
      socket.off('member:updated', srv.onMemberUpdated)
      socket.off('channel:permissions:updated', srv.onChannelPermissionsUpdated)
      socket.off('channel:created', srv.onChannelCreated)
      socket.off('channel:updated', srv.onChannelUpdated)
      socket.off('channel:deleted', srv.onChannelDeleted)
      socket.off('category:created', srv.onCategoryCreated)
      socket.off('category:updated', srv.onCategoryUpdated)
      socket.off('category:deleted', srv.onCategoryDeleted)
      socket.off('category:reorder', srv.onCategoryReorder)
      socket.off('server:updated', srv.onServerUpdated)
      socket.off('user:profile', srv.onUserProfile)
      socket.off('friend:request', srv.onFriendRequest)
      socket.off('friend:accepted', srv.onFriendAccepted)
      socket.off('friend:declined', srv.onFriendDeclined)
      socket.off('friend:cancelled', srv.onFriendCancelled)
      socket.off('friend:removed', srv.onFriendRemoved)
      presence.cleanup()
      disconnectSocket()
      setIsConnected(false)
    }
  }, [accessToken])

  return { socket: getSocket(), isConnected }
}
