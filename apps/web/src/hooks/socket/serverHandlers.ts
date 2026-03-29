import type { Channel, ChannelCategory, ServerEvent } from '@chat/shared'
import { showNotification } from '@/lib/notifications'
import { useAuthStore } from '@/stores/auth.store'
import { useChannelStore } from '@/stores/channel.store'
import { useEventStore } from '@/stores/event.store'
import { useFriendStore } from '@/stores/friend.store'
import { useMemberStore } from '@/stores/member.store'
import { useServerStore } from '@/stores/server.store'

export function createServerHandlers() {
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

  const onMemberUpdated = (payload: { serverId: string; userId: string; roleId?: string }) => {
    const currentServerId = useServerStore.getState().currentServerId
    if (payload.serverId === currentServerId && payload.roleId) {
      useMemberStore.getState().updateMemberRole(payload.serverId, payload.userId, payload.roleId)
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

  const onCategoryCreated = (payload: { serverId: string; category: ChannelCategory }) => {
    const currentServerId = useServerStore.getState().currentServerId
    if (payload.serverId === currentServerId) {
      useChannelStore.getState().addCategory(payload.category)
    }
  }

  const onCategoryUpdated = (payload: { serverId: string; category: ChannelCategory }) => {
    const currentServerId = useServerStore.getState().currentServerId
    if (payload.serverId === currentServerId) {
      useChannelStore.getState().updateCategory(payload.category)
    }
  }

  const onCategoryDeleted = (payload: { serverId: string; categoryId: string }) => {
    const currentServerId = useServerStore.getState().currentServerId
    if (payload.serverId === currentServerId) {
      useChannelStore.getState().removeCategory(payload.categoryId)
    }
  }

  const onCategoryReorder = (payload: { categoryIds: string[] }) => {
    useChannelStore.getState().applyCategoryReorder(payload.categoryIds)
  }

  const onServerUpdated = (payload: { serverId: string; [key: string]: unknown }) => {
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

  return {
    onEventCreated,
    onEventUpdated,
    onEventCancelled,
    onEventCompleted,
    onEventStarted,
    onEventInterest,
    onMemberLeft,
    onMemberUpdated,
    onChannelCreated,
    onChannelUpdated,
    onChannelDeleted,
    onCategoryCreated,
    onCategoryUpdated,
    onCategoryDeleted,
    onCategoryReorder,
    onServerUpdated,
    onUserProfile,
    onFriendRequest,
    onFriendAccepted,
    onFriendDeclined,
    onFriendCancelled,
    onFriendRemoved
  }
}
