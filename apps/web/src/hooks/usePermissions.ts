import { useMemo } from 'react'
import { Permission, hasPermission, permsToBigInt, ALL_PERMISSIONS, type Role } from '@chat/shared'
import { useMemberStore } from '@/stores/member.store'
import { useAuthStore } from '@/stores/auth.store'
import { useServerStore } from '@/stores/server.store'

export function usePermissions(serverId?: string | null) {
  const userId = useAuthStore((s) => s.user?.id)
  const server = useServerStore((s) => s.servers.find((sv) => sv.id === serverId))
  const member = useMemberStore((s) =>
    s.members.find((m) => m.userId === userId && m.serverId === serverId)
  )

  return useMemo(() => {
    if (!serverId || !userId || !member) {
      return {
        permissions: 0n,
        has: (_flag: bigint) => false,
        isOwner: false,
        role: undefined as Role | undefined,
      }
    }

    const isOwner = server?.ownerId === userId
    if (isOwner) {
      return {
        permissions: ALL_PERMISSIONS,
        has: (_flag: bigint) => true,
        isOwner: true,
        role: member.role,
      }
    }

    const perms = member.role ? permsToBigInt(member.role.permissions) : 0n

    return {
      permissions: perms,
      has: (flag: bigint) => hasPermission(perms, flag),
      isOwner: false,
      role: member.role,
    }
  }, [serverId, userId, member, server?.ownerId])
}

export { Permission }
