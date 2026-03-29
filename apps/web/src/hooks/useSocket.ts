import type { Channel, LinkPreview, Message, ServerEvent, ServerRole } from '@chat/shared'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { showNotification } from '@/lib/notifications'
import { connectSocket, disconnectSocket, getSocket } from '@/lib/socket'
import { useAuthStore } from '@/stores/auth.store'
import { useChannelStore } from '@/stores/channel.store'
import { useDmStore } from '@/stores/dm.store'
import { useServerStore } from '@/stores/server.store'
import { useMemberStore } from '@/stores/member.store'
import { useMessageStore } from '@/stores/message.store'
import { useNotifPrefStore } from '@/stores/notifPref.store'
import { useReadStateStore } from '@/stores/readState.store'
import { useVoiceStore, type VoiceParticipant } from '@/stores/voice.store'
import { useVoiceConnectionStore } from '@/stores/voice-connection.store'
import { useEventStore } from '@/stores/event.store'
import { useFriendStore } from '@/stores/friend.store'
import { playJoinSound, playLeaveSound } from '@/lib/sounds'

type MessageDeletePayload = {
  messageId: string
  channelId: string
}

type TypingPayload = {
  userId: string
  channelId: string
  username: string
}

type OnlinePayload = {
  userId: string
}

type StatusPayload = {
  userId: string
  status: string
}

type ReactionPayload = {
  messageId: string
  emoji: string
  userId: string
  isCustom: boolean
  conversationId?: string
}

type LinkPreviewPayload = {
  messageId: string
  linkPreviews: LinkPreview[]
}

type DmMessagePayload = Message & { conversationId: string }
type DmDeletePayload = { messageId: string; conversationId: string }
type DmTypingPayload = {
  userId: string
  conversationId: string
  username: string
}
type DmLinkPreviewPayload = LinkPreviewPayload & { conversationId: string }

function describeAttachments(msg: Message): string {
  const attachments = msg.attachments
  if (!attachments || attachments.length === 0) return '[attachment]'
  const first = attachments[0]
  const label =
    first.type === 'image' ? 'an image'
    : first.type === 'video' ? 'a video'
    : first.type === 'gif' ? 'a GIF'
    : 'a file'
  if (attachments.length === 1) return `sent ${label}`
  return `sent ${attachments.length} files`
}

function notifBody(msg: Message): string {
  if (msg.content && msg.content.trim()) return msg.content.slice(0, 100)
  return describeAttachments(msg)
}

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
        }

        if (useServerStore.getState().viewMode === 'dm') {
          useDmStore.getState().fetchConversations().catch(() => {})
        }
      }
      hasConnectedBefore = true

      if (!document.hidden || useVoiceConnectionStore.getState().room) {
        socket.emit('activity:active')
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

    const onMessageNew = (msg: Message & { mentionedUserIds?: string[]; serverId?: string; mentionEveryone?: boolean; mentionHere?: boolean }) => {
      const channelId = useChannelStore.getState().currentChannelId
      const viewMode = useServerStore.getState().viewMode
      const myId = useAuthStore.getState().user?.id
      const isViewingChannel = viewMode === 'server' && msg.channelId != null && msg.channelId === channelId
      if (isViewingChannel) {
        useMessageStore.getState().addMessage(msg)
        throttledAck(() => useReadStateStore.getState().ackChannel(channelId!))
      } else if (msg.channelId && msg.authorId !== myId) {
        const isMentioned = myId
          ? (msg.mentionedUserIds ?? []).includes(myId) || !!msg.mentionEveryone || !!msg.mentionHere
          : false
        useReadStateStore.getState().incrementChannel(msg.channelId, isMentioned, msg.serverId)

        const level = useNotifPrefStore.getState().getEffective(msg.channelId, msg.serverId)
        if (level !== 'none' && (level !== 'mentions' || isMentioned)) {
          const author = msg.author?.displayName ?? msg.author?.username ?? 'Someone'
          const preview = notifBody(msg)
          const url = msg.serverId ? `/channels/${msg.serverId}/${msg.channelId}` : undefined
          const ch = useChannelStore.getState().channels.find((c) => c.id === msg.channelId)
          const channelTitle = ch ? `#${ch.name}` : `#${msg.channelId.slice(0, 8)}`
          showNotification(channelTitle, `${author}: ${preview}`, url, undefined, isMentioned ? 'mention' : 'message')
        }
      }
    }

    const onMessageEdit = (msg: Message) => {
      const channelId = useChannelStore.getState().currentChannelId
      if (msg.channelId != null && msg.channelId === channelId) {
        useMessageStore.getState().updateMessage(msg)
      }
    }

    const onMessageDelete = (payload: MessageDeletePayload) => {
      const channelId = useChannelStore.getState().currentChannelId
      if (payload.channelId === channelId) {
        useMessageStore.getState().removeMessage(payload.messageId)
      }
    }

    const pendingOffline = new Map<string, ReturnType<typeof setTimeout>>()

    const onUserOnline = (payload: OnlinePayload) => {
      const pending = pendingOffline.get(payload.userId)
      if (pending) {
        clearTimeout(pending)
        pendingOffline.delete(payload.userId)
      }
      useMemberStore.getState().setUserOnline(payload.userId)
      useMemberStore.getState().setUserStatus(payload.userId, 'online')
      useFriendStore.getState().updateFriendStatus(payload.userId, 'online')
      const currentUser = useAuthStore.getState().user
      if (currentUser && currentUser.id === payload.userId) {
        useAuthStore.getState().setUser({ ...currentUser, status: 'online' })
      }
    }

    const onUserOffline = (payload: OnlinePayload) => {
      const existing = pendingOffline.get(payload.userId)
      if (existing) clearTimeout(existing)
      pendingOffline.set(
        payload.userId,
        setTimeout(() => {
          pendingOffline.delete(payload.userId)
          useMemberStore.getState().setUserOffline(payload.userId)
          useFriendStore.getState().updateFriendStatus(payload.userId, 'offline')
        }, 5000)
      )
    }

    const onUserStatus = (payload: StatusPayload) => {
      useMemberStore.getState().setUserStatus(payload.userId, payload.status)
      useFriendStore.getState().updateFriendStatus(payload.userId, payload.status as 'online' | 'idle' | 'dnd' | 'offline')
      const currentUser = useAuthStore.getState().user
      if (currentUser && currentUser.id === payload.userId) {
        useAuthStore
          .getState()
          .setUser({ ...currentUser, status: payload.status as 'online' | 'idle' | 'dnd' | 'offline' })
      }
    }

    const onUserCustomStatus = (payload: { userId: string; customStatus: string | null }) => {
      useMemberStore.getState().setUserCustomStatus(payload.userId, payload.customStatus)
      const currentUser = useAuthStore.getState().user
      if (currentUser && currentUser.id === payload.userId) {
        useAuthStore.getState().setUser({ ...currentUser, customStatus: payload.customStatus })
      }
    }

    const onMemberJoined = (payload: { serverId: string; member: import('@/stores/member.store').Member }) => {
      const currentServerId = useServerStore.getState().currentServerId
      if (payload.serverId === currentServerId) {
        useMemberStore.getState().addMember(payload.member)
      }
      useMemberStore.getState().setUserOnline(payload.member.userId)
    }

    const onUserTyping = (payload: TypingPayload) => {
      const channelId = useChannelStore.getState().currentChannelId
      if (payload.channelId === channelId) {
        useMessageStore.getState().setTypingUser(payload.channelId, payload.userId, payload.username)
      }
    }

    const onReactionAdd = (payload: ReactionPayload) => {
      if (payload.conversationId) {
        useDmStore.getState().addReaction(payload.messageId, payload.emoji, payload.userId)
      } else {
        useMessageStore.getState().addReaction(payload.messageId, payload.emoji, payload.userId)
      }
    }

    const onReactionRemove = (payload: ReactionPayload) => {
      if (payload.conversationId) {
        useDmStore.getState().removeReaction(payload.messageId, payload.emoji, payload.userId)
      } else {
        useMessageStore.getState().removeReaction(payload.messageId, payload.emoji, payload.userId)
      }
    }

    const onMessagePin = (msg: Message) => {
      useMessageStore.getState().updateMessage(msg)
      if (msg.channelId) {
        useChannelStore.getState().adjustPinnedCount(msg.channelId, 1)
      }
    }

    const onMessageUnpin = (msg: Message) => {
      useMessageStore.getState().updateMessage(msg)
      if (msg.channelId) {
        useChannelStore.getState().adjustPinnedCount(msg.channelId, -1)
      }
    }

    const onLinkPreviews = (payload: LinkPreviewPayload) => {
      useMessageStore.getState().setLinkPreviews(payload.messageId, payload.linkPreviews)
    }

    const onPresenceInit = (payload: { onlineUserIds: string[] }) => {
      useMemberStore.getState().initOnlineUsers(payload.onlineUserIds)
      const currentUser = useAuthStore.getState().user
      if (currentUser && payload.onlineUserIds.includes(currentUser.id)) {
        useAuthStore.getState().setUser({ ...currentUser, status: 'online' })
      }
      useReadStateStore.getState().fetchAll()
      useNotifPrefStore.getState().fetchAll()
    }

    const onDmNew = (payload: DmMessagePayload) => {
      const dmState = useDmStore.getState()
      const currentConvId = dmState.currentConversationId
      const viewMode = useServerStore.getState().viewMode
      const myId = useAuthStore.getState().user?.id
      const isViewingConversation = viewMode === 'dm' && payload.conversationId === currentConvId
      if (isViewingConversation) {
        dmState.addMessage(payload)
        throttledAck(() => useReadStateStore.getState().ackDm(currentConvId!))
      } else if (payload.authorId !== myId) {
        useReadStateStore.getState().incrementDm(payload.conversationId)
        const author = payload.author?.displayName ?? payload.author?.username ?? 'Someone'
        const preview = notifBody(payload)
        const url = `/channels/@me/${payload.conversationId}`
        showNotification(`DM from ${author}`, preview, url, undefined, 'mention')
      }

      const inList = dmState.conversations.some((c) => c.id === payload.conversationId)
      if (!inList) {
        api
          .getDmConversation(payload.conversationId)
          .then((conv) => {
            useDmStore.getState().addOrUpdateConversation(conv)
          })
          .catch(() => {})
      }

      dmState.updateConversationLastMessage(payload.conversationId, {
        content: payload.content ?? null,
        authorId: payload.authorId ?? '',
        createdAt: payload.createdAt
      })
    }

    const onDmEdit = (payload: DmMessagePayload) => {
      const currentConvId = useDmStore.getState().currentConversationId
      if (payload.conversationId === currentConvId) {
        useDmStore.getState().updateMessage(payload)
      }
    }

    const onDmDelete = (payload: DmDeletePayload) => {
      const currentConvId = useDmStore.getState().currentConversationId
      if (payload.conversationId === currentConvId) {
        useDmStore.getState().removeMessage(payload.messageId)
      }
    }

    const onDmTyping = (_payload: DmTypingPayload) => {}

    const onVoiceParticipants = (state: Record<string, VoiceParticipant[]>) => {
      useVoiceStore.getState().setAll(state)
    }

    const onVoiceParticipantJoined = (payload: { channelId: string; userId: string; username: string }) => {
      useVoiceStore.getState().addParticipant(payload.channelId, {
        userId: payload.userId,
        username: payload.username
      })
      const myVoiceChannel = useVoiceConnectionStore.getState().currentChannelId
      const myId = useAuthStore.getState().user?.id
      if (myVoiceChannel === payload.channelId && payload.userId !== myId) {
        playJoinSound()
      }
    }

    const onVoiceParticipantLeft = (payload: { channelId: string; userId: string }) => {
      useVoiceStore.getState().removeParticipant(payload.channelId, payload.userId)
      const myVoiceChannel = useVoiceConnectionStore.getState().currentChannelId
      const myId = useAuthStore.getState().user?.id
      if (myVoiceChannel === payload.channelId && payload.userId !== myId) {
        playLeaveSound()
      }
    }

    const onVoiceParticipantState = (payload: {
      channelId: string
      userId: string
      muted?: boolean
      deafened?: boolean
      camera?: boolean
      screenShare?: boolean
    }) => {
      const update: Partial<Pick<VoiceParticipant, 'muted' | 'deafened' | 'camera' | 'screenShare'>> = {}
      if (payload.muted !== undefined) update.muted = payload.muted
      if (payload.deafened !== undefined) update.deafened = payload.deafened
      if (payload.camera !== undefined) update.camera = payload.camera
      if (payload.screenShare !== undefined) update.screenShare = payload.screenShare

      useVoiceStore.getState().updateParticipantState(payload.channelId, payload.userId, update)
    }

    const onChannelReorder = (payload: { channelIds: string[] }) => {
      useChannelStore.getState().applyReorder(payload.channelIds)
    }

    const onDmLinkPreviews = (payload: DmLinkPreviewPayload) => {
      const currentConvId = useDmStore.getState().currentConversationId
      if (payload.conversationId === currentConvId) {
        const msgs = useDmStore.getState().messages
        const msg = msgs.find((m) => m.id === payload.messageId)
        if (msg) {
          useDmStore.getState().updateMessage({
            ...msg,
            linkPreviews: payload.linkPreviews
          })
        }
      }
    }

    const onEventCreated = (event: ServerEvent) => useEventStore.getState().addEvent(event)
    const onEventUpdated = (event: ServerEvent) => useEventStore.getState().updateEvent(event)
    const onEventCancelled = (event: ServerEvent) => useEventStore.getState().removeEvent(event.id)
    const onEventCompleted = (event: ServerEvent) => useEventStore.getState().removeEvent(event.id)
    const onEventStarted = (event: ServerEvent) => useEventStore.getState().updateEvent(event)
    const onEventInterest = (payload: { eventId: string; userId: string; interested: boolean; count: number }) => {
      useEventStore.getState().updateInterest(payload.eventId, payload.userId, payload.interested, payload.count)
    }

    const onMemberLeft = (payload: { serverId: string; userId: string }) => {
      const currentServerId = useServerStore.getState().currentServerId
      if (payload.serverId === currentServerId) {
        useMemberStore.getState().removeMember(payload.serverId, payload.userId)
      }
      const myId = useAuthStore.getState().user?.id
      if (payload.userId === myId) {
        useServerStore.getState().removeServer(payload.serverId)
      }
    }

    const onMemberUpdated = (payload: { serverId: string; userId: string; role: string }) => {
      const currentServerId = useServerStore.getState().currentServerId
      if (payload.serverId === currentServerId) {
        useMemberStore.getState().updateMemberRole(payload.serverId, payload.userId, payload.role as ServerRole)
      }
    }

    const onChannelCreated = (payload: { serverId: string; channel: Channel }) => {
      const currentServerId = useServerStore.getState().currentServerId
      if (payload.serverId === currentServerId) {
        useChannelStore.getState().addChannel(payload.channel)
      }
    }

    const onChannelUpdated = (payload: { serverId: string; channel: Channel }) => {
      const currentServerId = useServerStore.getState().currentServerId
      if (payload.serverId === currentServerId) {
        useChannelStore.getState().updateChannel(payload.channel)
      }
    }

    const onChannelDeleted = (payload: { serverId: string; channelId: string }) => {
      const currentServerId = useServerStore.getState().currentServerId
      if (payload.serverId === currentServerId) {
        useChannelStore.getState().removeChannel(payload.channelId)
      }
    }

    const onServerUpdated = (payload: { serverId: string; name?: string; iconUrl?: string | null }) => {
      const { serverId, ...patch } = payload
      useServerStore.getState().updateServerInList(serverId, patch)
    }

    const onUserProfile = (payload: { userId: string; displayName?: string; bio?: string; avatarUrl?: string | null }) => {
      const { userId, ...data } = payload
      useMemberStore.getState().updateUserProfile(userId, data)
    }

    const onFriendRequest = (payload: { friendshipId: string; user: Record<string, unknown>; direction: string; createdAt: string }) => {
      useFriendStore.getState().addPendingRequest(payload as unknown as import('@chat/shared').FriendRequest)
      if (payload.direction === 'incoming') {
        const sender = payload.user as { displayName?: string; username?: string }
        const name = sender.displayName ?? sender.username ?? 'Someone'
        showNotification('Friend Request', `${name} sent you a friend request`, '/channels/@me', undefined, 'friend')
      }
    }
    const onFriendAccepted = (payload: { friendshipId: string; user: Record<string, unknown> }) => {
      useFriendStore.getState().removePending(payload.friendshipId)
      useFriendStore.getState().fetchFriends()
    }
    const onFriendDeclined = (payload: { friendshipId: string }) => {
      useFriendStore.getState().removePending(payload.friendshipId)
    }
    const onFriendCancelled = (payload: { friendshipId: string }) => {
      useFriendStore.getState().removePending(payload.friendshipId)
    }
    const onFriendRemoved = (payload: { friendshipId: string }) => {
      useFriendStore.getState().removeFriendByFriendshipId(payload.friendshipId)
    }

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('connect_error', onConnectError)
    socket.on('message:new', onMessageNew)
    socket.on('message:edit', onMessageEdit)
    socket.on('message:delete', onMessageDelete)
    socket.on('user:online', onUserOnline)
    socket.on('user:offline', onUserOffline)
    socket.on('user:status', onUserStatus)
    socket.on('user:custom-status', onUserCustomStatus)
    socket.on('member:joined', onMemberJoined)
    socket.on('user:typing', onUserTyping)
    socket.on('reaction:add', onReactionAdd)
    socket.on('reaction:remove', onReactionRemove)
    socket.on('message:pin', onMessagePin)
    socket.on('message:unpin', onMessageUnpin)
    socket.on('message:link-previews', onLinkPreviews)
    socket.on('presence:init', onPresenceInit)
    socket.on('dm:new', onDmNew)
    socket.on('dm:edit', onDmEdit)
    socket.on('dm:delete', onDmDelete)
    socket.on('dm:typing', onDmTyping)
    socket.on('dm:link-previews', onDmLinkPreviews)
    socket.on('voice:participants', onVoiceParticipants)
    socket.on('voice:participant-joined', onVoiceParticipantJoined)
    socket.on('voice:participant-left', onVoiceParticipantLeft)
    socket.on('voice:participant-state', onVoiceParticipantState)
    socket.on('channel:reorder', onChannelReorder)
    socket.on('event:created', onEventCreated)
    socket.on('event:updated', onEventUpdated)
    socket.on('event:cancelled', onEventCancelled)
    socket.on('event:completed', onEventCompleted)
    socket.on('event:started', onEventStarted)
    socket.on('event:interest', onEventInterest)
    socket.on('member:left', onMemberLeft)
    socket.on('member:updated', onMemberUpdated)
    socket.on('channel:created', onChannelCreated)
    socket.on('channel:updated', onChannelUpdated)
    socket.on('channel:deleted', onChannelDeleted)
    socket.on('server:updated', onServerUpdated)
    socket.on('user:profile', onUserProfile)
    socket.on('friend:request', onFriendRequest)
    socket.on('friend:accepted', onFriendAccepted)
    socket.on('friend:declined', onFriendDeclined)
    socket.on('friend:cancelled', onFriendCancelled)
    socket.on('friend:removed', onFriendRemoved)

    setIsConnected(socket.connected)

    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('connect_error', onConnectError)
      socket.off('message:new', onMessageNew)
      socket.off('message:edit', onMessageEdit)
      socket.off('message:delete', onMessageDelete)
      socket.off('user:online', onUserOnline)
      socket.off('user:offline', onUserOffline)
      socket.off('user:status', onUserStatus)
      socket.off('user:custom-status', onUserCustomStatus)
      socket.off('member:joined', onMemberJoined)
      socket.off('user:typing', onUserTyping)
      socket.off('reaction:add', onReactionAdd)
      socket.off('reaction:remove', onReactionRemove)
      socket.off('message:pin', onMessagePin)
      socket.off('message:unpin', onMessageUnpin)
      socket.off('message:link-previews', onLinkPreviews)
      socket.off('presence:init', onPresenceInit)
      socket.off('dm:new', onDmNew)
      socket.off('dm:edit', onDmEdit)
      socket.off('dm:delete', onDmDelete)
      socket.off('dm:typing', onDmTyping)
      socket.off('dm:link-previews', onDmLinkPreviews)
      socket.off('voice:participants', onVoiceParticipants)
      socket.off('voice:participant-joined', onVoiceParticipantJoined)
      socket.off('voice:participant-left', onVoiceParticipantLeft)
      socket.off('voice:participant-state', onVoiceParticipantState)
      socket.off('channel:reorder', onChannelReorder)
      socket.off('event:created', onEventCreated)
      socket.off('event:updated', onEventUpdated)
      socket.off('event:cancelled', onEventCancelled)
      socket.off('event:completed', onEventCompleted)
      socket.off('event:started', onEventStarted)
      socket.off('event:interest', onEventInterest)
      socket.off('member:left', onMemberLeft)
      socket.off('member:updated', onMemberUpdated)
      socket.off('channel:created', onChannelCreated)
      socket.off('channel:updated', onChannelUpdated)
      socket.off('channel:deleted', onChannelDeleted)
      socket.off('server:updated', onServerUpdated)
      socket.off('user:profile', onUserProfile)
      socket.off('friend:request', onFriendRequest)
      socket.off('friend:accepted', onFriendAccepted)
      socket.off('friend:declined', onFriendDeclined)
      socket.off('friend:cancelled', onFriendCancelled)
      socket.off('friend:removed', onFriendRemoved)
      for (const timer of pendingOffline.values()) clearTimeout(timer)
      pendingOffline.clear()
      disconnectSocket()
      setIsConnected(false)
    }
  }, [accessToken])

  return { socket: getSocket(), isConnected }
}
