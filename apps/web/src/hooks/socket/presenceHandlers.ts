import type { UserActivity } from '@chat/shared'
import { useActivityStore } from '@/stores/activity.store'
import { useAuthStore } from '@/stores/auth.store'
import { useFriendStore } from '@/stores/friend.store'
import { useMemberStore } from '@/stores/member.store'
import { useNotifPrefStore } from '@/stores/notifPref.store'
import { useServerStore } from '@/stores/server.store'
import type { OnlinePayload, StatusPayload } from './types'
import { requestReadStateRefresh } from '@/lib/readStateRefresh'

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
        useActivityStore.getState().setUserActivity(payload.userId, null)
      }, 5000)
    )
  }

  const onUserStatus = (payload: StatusPayload) => {
    if (payload.status === 'offline') useActivityStore.getState().setUserActivity(payload.userId, null)
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

  const onUserActivity = (payload: { userId: string; activity: UserActivity | null; revision?: number }) => {
    useActivityStore.getState().setUserActivity(payload.userId, payload.activity, payload.revision)
  }

  const onActivityInit = (payload: { activities: Record<string, UserActivity>; revision?: number }) => {
    useActivityStore.getState().initActivities(payload.activities, payload.revision)
  }

  const onActivityPreferencesChanged = () => {
    const store = useActivityStore.getState()
    void store.fetchSettings().catch(() => {})
    void store.fetchGames().catch(() => {})
    void store.fetchServerPrefs().catch(() => {})
  }

  const onActivityDisconnect = () => useActivityStore.getState().resetDisplay()

  const onPresenceInit = (payload: { onlineUserIds: string[] }) => {
    useMemberStore.getState().initOnlineUsers(payload.onlineUserIds)
    requestReadStateRefresh()
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
    onUserActivity,
    onActivityInit,
    onActivityPreferencesChanged,
    onActivityDisconnect,
    onPresenceInit,
    onFriendsPresence,
    onMemberJoined,
    cleanup
  }
}
