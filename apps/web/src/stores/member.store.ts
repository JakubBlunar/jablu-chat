import type { ServerRole } from '@chat/shared'
import { create } from 'zustand'
import { api } from '@/lib/api'

export type Member = {
  userId: string
  serverId: string
  role: ServerRole
  joinedAt: string
  user: {
    id: string
    username: string
    displayName: string | null
    email: string
    avatarUrl: string | null
    bio: string | null
    status?: string
    customStatus?: string | null
  }
}

type MemberState = {
  members: Member[]
  onlineUserIds: Set<string>
  isLoading: boolean
  fetchMembers: (serverId: string) => Promise<void>
  addMember: (member: Member) => void
  removeMember: (serverId: string, userId: string) => void
  updateMemberRole: (serverId: string, userId: string, role: ServerRole) => void
  initOnlineUsers: (userIds: string[]) => void
  setUserOnline: (userId: string) => void
  setUserOffline: (userId: string) => void
  setUserStatus: (userId: string, status: string) => void
  setUserCustomStatus: (userId: string, customStatus: string | null) => void
  updateUserProfile: (userId: string, data: Partial<Member['user']>) => void
}

export const useMemberStore = create<MemberState>((set) => ({
  members: [],
  onlineUserIds: new Set(),
  isLoading: false,

  fetchMembers: async (serverId) => {
    set({ isLoading: true })
    try {
      const list = await api.get<Member[]>(`/api/servers/${serverId}/members`)
      set({ members: list, isLoading: false })
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

  updateMemberRole: (serverId, userId, role) =>
    set((s) => ({
      members: s.members.map((m) =>
        m.serverId === serverId && m.userId === userId ? { ...m, role } : m
      )
    })),

  initOnlineUsers: (userIds) => set(() => ({ onlineUserIds: new Set(userIds) })),

  setUserOnline: (userId) =>
    set((s) => {
      const next = new Set(s.onlineUserIds)
      next.add(userId)
      return { onlineUserIds: next }
    }),

  setUserOffline: (userId) =>
    set((s) => {
      const next = new Set(s.onlineUserIds)
      next.delete(userId)
      return { onlineUserIds: next }
    }),

  setUserStatus: (userId, status) =>
    set((s) => ({
      members: s.members.map((m) => (m.userId === userId ? { ...m, user: { ...m.user, status } } : m))
    })),

  setUserCustomStatus: (userId: string, customStatus: string | null) =>
    set((s) => ({
      members: s.members.map((m) => (m.userId === userId ? { ...m, user: { ...m.user, customStatus } } : m))
    })),

  updateUserProfile: (userId, data) =>
    set((s) => ({
      members: s.members.map((m) => (m.userId === userId ? { ...m, user: { ...m.user, ...data } } : m))
    }))
}))
