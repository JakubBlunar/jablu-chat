import type { Role } from '@chat/shared'
import { create } from 'zustand'
import { api } from '@/lib/api'

export type Member = {
  userId: string
  serverId: string
  roleIds: string[]
  joinedAt: string
  mutedUntil?: string | null
  onboardingCompleted?: boolean
  roles?: Role[]
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

export function getTopRole(member: Member): Role | undefined {
  if (!member.roles || member.roles.length === 0) return undefined
  const nonDefault = member.roles.filter((r) => !r.isDefault)
  if (nonDefault.length === 0) return member.roles[0]
  return nonDefault.reduce((top, r) => (r.position > top.position ? r : top), nonDefault[0])
}

export function getRoleColor(member: Member): string | null {
  if (!member.roles || member.roles.length === 0) return null
  const withColor = member.roles.filter((r) => r.color)
  if (withColor.length === 0) return null
  return withColor.reduce((best, r) => (r.position > best.position ? r : best), withColor[0]).color
}

type MemberState = {
  members: Member[]
  onlineUserIds: Set<string>
  realtimeStatuses: Map<string, string>
  isLoading: boolean
  fetchMembers: (serverId: string) => Promise<void>
  addMember: (member: Member) => void
  removeMember: (serverId: string, userId: string) => void
  updateMemberRoles: (serverId: string, userId: string, roleIds: string[], roles?: Role[]) => void
  updateMemberTimeout: (serverId: string, userId: string, mutedUntil: string | null) => void
  updateMemberOnboarding: (serverId: string, userId: string, completed: boolean) => void
  updateRoleInMembers: (role: Role) => void
  removeRoleFromMembers: (serverId: string, roleId: string) => void
  initOnlineUsers: (userIds: string[]) => void
  setUserOnline: (userId: string) => void
  setUserOffline: (userId: string) => void
  setUserStatus: (userId: string, status: string) => void
  setUserCustomStatus: (userId: string, customStatus: string | null) => void
  updateUserProfile: (userId: string, data: Partial<Member['user']>) => void
  mergeFriendsPresence: (onlineFriendIds: string[], friendStatuses?: Record<string, string>) => void
  resolveStatus: (userId: string) => string
}

function normalizeMember(raw: unknown): Member {
  const m = raw as Record<string, unknown>
  const roles = m.roles as Array<{ role?: Role; id?: string }> | undefined
  let normalizedRoles: Role[] | undefined
  let roleIds: string[]

  if (Array.isArray(roles) && roles.length > 0 && roles[0] && typeof roles[0] === 'object' && 'role' in roles[0]) {
    normalizedRoles = roles.map((r) => r.role as Role)
    roleIds = normalizedRoles.map((r) => r.id)
  } else if (Array.isArray(roles)) {
    normalizedRoles = roles as unknown as Role[]
    roleIds = normalizedRoles.map((r) => r.id)
  } else {
    normalizedRoles = undefined
    roleIds = (m.roleIds as string[]) ?? []
  }

  return {
    ...m,
    roleIds,
    roles: normalizedRoles,
  } as Member
}

export const useMemberStore = create<MemberState>((set, get) => ({
  members: [],
  onlineUserIds: new Set(),
  realtimeStatuses: new Map(),
  isLoading: false,

  fetchMembers: async (serverId) => {
    set({ isLoading: true })
    try {
      const list = await api.get<unknown[]>(`/api/servers/${serverId}/members`)
      const normalized = list.map(normalizeMember)
      const rt = get().realtimeStatuses
      const patched = rt.size > 0
        ? normalized.map((m) => {
            const live = rt.get(m.userId)
            return live ? { ...m, user: { ...m.user, status: live } } : m
          })
        : normalized
      set({ members: patched, isLoading: false })
    } catch (e) {
      set({ isLoading: false })
      throw e
    }
  },

  addMember: (member) =>
    set((s) => {
      if (s.members.some((m) => m.userId === member.userId && m.serverId === member.serverId)) return s
      return { members: [...s.members, normalizeMember(member)] }
    }),

  removeMember: (serverId, userId) =>
    set((s) => ({
      members: s.members.filter((m) => !(m.serverId === serverId && m.userId === userId))
    })),

  updateMemberRoles: (serverId, userId, roleIds, roles) =>
    set((s) => ({
      members: s.members.map((m) =>
        m.serverId === serverId && m.userId === userId
          ? { ...m, roleIds, ...(roles ? { roles } : {}) }
          : m
      )
    })),

  updateMemberTimeout: (serverId, userId, mutedUntil) =>
    set((s) => ({
      members: s.members.map((m) =>
        m.serverId === serverId && m.userId === userId ? { ...m, mutedUntil } : m
      )
    })),

  updateMemberOnboarding: (serverId, userId, completed) =>
    set((s) => ({
      members: s.members.map((m) =>
        m.serverId === serverId && m.userId === userId ? { ...m, onboardingCompleted: completed } : m
      )
    })),

  updateRoleInMembers: (role) =>
    set((s) => ({
      members: s.members.map((m) => {
        if (!m.roles) return m
        const idx = m.roles.findIndex((r) => r.id === role.id)
        if (idx === -1) return m
        const newRoles = [...m.roles]
        newRoles[idx] = role
        return { ...m, roles: newRoles }
      })
    })),

  removeRoleFromMembers: (serverId, roleId) =>
    set((s) => ({
      members: s.members.map((m) => {
        if (m.serverId !== serverId) return m
        if (!m.roleIds.includes(roleId)) return m
        return {
          ...m,
          roleIds: m.roleIds.filter((id) => id !== roleId),
          roles: m.roles?.filter((r) => r.id !== roleId)
        }
      })
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
