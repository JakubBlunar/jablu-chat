import type { Role } from '@chat/shared'
import { create } from 'zustand'
import { api } from '@/lib/api'

export type Member = {
  userId: string
  serverId: string
  roleId: string
  joinedAt: string
  mutedUntil?: string | null
  role?: Role
  user: {
    id: string
    username: string
    displayName: string | null
    email?: string
    avatarUrl: string | null
    bio: string | null
    status?: string
    customStatus?: string | null
  }
}

type MemberState = {
  members: Member[]
  /** All user IDs known to be online (server co-members + friends) */
  onlineUserIds: Set<string>
  /** Authoritative real-time status for any known user */
  realtimeStatuses: Map<string, string>
  isLoading: boolean
  fetchMembers: (serverId: string) => Promise<void>
  addMember: (member: Member) => void
  removeMember: (serverId: string, userId: string) => void
  updateMemberRole: (serverId: string, userId: string, roleId: string) => void
  updateMemberTimeout: (serverId: string, userId: string, mutedUntil: string | null) => void
  initOnlineUsers: (userIds: string[]) => void
  setUserOnline: (userId: string) => void
  setUserOffline: (userId: string) => void
  setUserStatus: (userId: string, status: string) => void
  setUserCustomStatus: (userId: string, customStatus: string | null) => void
  updateUserProfile: (userId: string, data: Partial<Member['user']>) => void
  mergeFriendsPresence: (onlineFriendIds: string[], friendStatuses?: Record<string, string>) => void
  resolveStatus: (userId: string) => string
}

export const useMemberStore = create<MemberState>((set, get) => ({
  members: [],
  onlineUserIds: new Set(),
  realtimeStatuses: new Map(),
  isLoading: false,

  fetchMembers: async (serverId) => {
    set({ isLoading: true })
    try {
      const list = await api.get<Member[]>(`/api/servers/${serverId}/members`)
      const rt = get().realtimeStatuses
      const patched = rt.size > 0
        ? list.map((m) => {
            const live = rt.get(m.userId)
            return live ? { ...m, user: { ...m.user, status: live } } : m
          })
        : list
      set({ members: patched, isLoading: false })
    } catch (e) {
      set({ isLoading: false })
      throw e
    }
  },

  addMember: (member) =>
    set((s) => {
      if (s.members.some((m) => m.userId === member.userId && m.serverId === member.serverId)) return s
      return { members: [...s.members, member] }
    }),

  removeMember: (serverId, userId) =>
    set((s) => ({
      members: s.members.filter((m) => !(m.serverId === serverId && m.userId === userId))
    })),

  updateMemberRole: (serverId, userId, roleId) =>
    set((s) => ({
      members: s.members.map((m) =>
        m.serverId === serverId && m.userId === userId ? { ...m, roleId } : m
      )
    })),

  updateMemberTimeout: (serverId, userId, mutedUntil) =>
    set((s) => ({
      members: s.members.map((m) =>
        m.serverId === serverId && m.userId === userId ? { ...m, mutedUntil } : m
      )
    })),

  initOnlineUsers: (userIds) => set(() => ({ onlineUserIds: new Set(userIds) })),

  setUserOnline: (userId) =>
    set((s) => {
      const next = new Set(s.onlineUserIds)
      next.add(userId)
      const rt = new Map(s.realtimeStatuses)
      rt.set(userId, 'online')
      return { onlineUserIds: next, realtimeStatuses: rt }
    }),

  setUserOffline: (userId) =>
    set((s) => {
      const next = new Set(s.onlineUserIds)
      next.delete(userId)
      const rt = new Map(s.realtimeStatuses)
      rt.delete(userId)
      return { onlineUserIds: next, realtimeStatuses: rt }
    }),

  setUserStatus: (userId, status) =>
    set((s) => {
      const rt = new Map(s.realtimeStatuses)
      rt.set(userId, status)
      return {
        realtimeStatuses: rt,
        members: s.members.map((m) => (m.userId === userId ? { ...m, user: { ...m.user, status } } : m))
      }
    }),

  setUserCustomStatus: (userId: string, customStatus: string | null) =>
    set((s) => ({
      members: s.members.map((m) => (m.userId === userId ? { ...m, user: { ...m.user, customStatus } } : m))
    })),

  updateUserProfile: (userId, data) =>
    set((s) => ({
      members: s.members.map((m) => (m.userId === userId ? { ...m, user: { ...m.user, ...data } } : m))
    })),

  mergeFriendsPresence: (onlineFriendIds, friendStatuses) =>
    set((s) => {
      const next = new Set(s.onlineUserIds)
      const rt = new Map(s.realtimeStatuses)
      for (const fid of onlineFriendIds) {
        next.add(fid)
        rt.set(fid, friendStatuses?.[fid] ?? 'online')
      }
      return { onlineUserIds: next, realtimeStatuses: rt }
    }),

  resolveStatus: (userId) => {
    const { onlineUserIds, realtimeStatuses } = get()
    if (!onlineUserIds.has(userId)) return 'offline'
    const rt = realtimeStatuses.get(userId)
    if (rt === 'idle' || rt === 'dnd' || rt === 'online') return rt
    return 'online'
  }
}))
