import { useAuthStore } from '@/stores/auth.store'
import { useFriendStore } from '@/stores/friend.store'
import { useMemberStore } from '@/stores/member.store'
import { useNotifPrefStore } from '@/stores/notifPref.store'
import { useReadStateStore } from '@/stores/readState.store'
import { useServerStore } from '@/stores/server.store'
import type { OnlinePayload, StatusPayload } from './types'

export function createPresenceHandlers() {
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

  const onPresenceInit = (payload: { onlineUserIds: string[] }) => {
    useMemberStore.getState().initOnlineUsers(payload.onlineUserIds)
    useReadStateStore.getState().fetchAll()
    useNotifPrefStore.getState().fetchAll()
  }

  const onFriendsPresence = (payload: { onlineFriendIds: string[]; friendStatuses?: Record<string, string> }) => {
    useMemberStore.getState().mergeFriendsPresence(payload.onlineFriendIds, payload.friendStatuses)
    const { friends, updateFriendStatus } = useFriendStore.getState()
    const onlineSet = new Set(payload.onlineFriendIds)
    const statuses = payload.friendStatuses ?? {}
    for (const f of friends) {
      if (onlineSet.has(f.id)) {
        const specific = statuses[f.id]
        const resolved = (specific === 'idle' || specific === 'dnd') ? specific : 'online'
        updateFriendStatus(f.id, resolved as 'online' | 'idle' | 'dnd')
      } else {
        updateFriendStatus(f.id, 'offline')
      }
    }
  }

  const onMemberJoined = (payload: { serverId: string; member: import('@/stores/member.store').Member }) => {
    const currentServerId = useServerStore.getState().currentServerId
    if (payload.serverId === currentServerId) {
      useMemberStore.getState().addMember(payload.member)
    }
    if (!payload.member.user?.isBot) {
      useMemberStore.getState().setUserOnline(payload.member.userId)
    }
  }

  const cleanup = () => {
    for (const timer of pendingOffline.values()) clearTimeout(timer)
    pendingOffline.clear()
  }

  return {
    onUserOnline,
    onUserOffline,
    onUserStatus,
    onUserCustomStatus,
    onPresenceInit,
    onFriendsPresence,
    onMemberJoined,
    cleanup
  }
}
