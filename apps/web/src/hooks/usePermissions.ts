import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { Permission, hasPermission, permsToBigInt, ALL_PERMISSIONS, type Role } from '@chat/shared'
import { useMemberStore, getTopRole } from '@/stores/member.store'
import { useAuthStore } from '@/stores/auth.store'
import { useServerStore } from '@/stores/server.store'
import { findMember } from '@/lib/memberIndex'

const EMPTY_ROLES: Role[] = []

export function usePermissions(serverId?: string | null) {
  const userId = useAuthStore((s) => s.user?.id)
  const ownerId = useServerStore((s) => s.servers.find((sv) => sv.id === serverId)?.ownerId)
  const { memberExists, roles } = useMemberStore(useShallow((s) => {
    const member = findMember(s.members, serverId, userId)
    return { memberExists: !!member, roles: member?.roles ?? EMPTY_ROLES }
  }))

  return useMemo(() => {
    if (!serverId || !userId || !memberExists) {
      return {
        permissions: 0n,
        has: (_flag: bigint) => false,
        isOwner: false,
        roles: EMPTY_ROLES,
        topRole: undefined,
      }
    }

    const isOwner = ownerId === userId
    if (isOwner) {
      return {
        permissions: ALL_PERMISSIONS,
        has: (_flag: bigint) => true,
        isOwner: true,
        roles,
        topRole: getTopRole({ roles }),
      }
    }

    let perms = 0n
    if (roles.length > 0) {
      for (const role of roles) {
        perms |= permsToBigInt(role.permissions)
      }
    }

    return {
      permissions: perms,
      has: (flag: bigint) => hasPermission(perms, flag),
      isOwner: false,
      roles,
      topRole: getTopRole({ roles }),
    }
  }, [serverId, userId, memberExists, roles, ownerId])
}

export { Permission }
