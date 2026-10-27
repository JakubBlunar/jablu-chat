import type { PrismaService } from '../prisma/prisma.service'
import type { RolesService } from '../roles/roles.service'

type Member = { userId: string; notifLevel: string | null; isBot: boolean }

/** Shared only by in-app and push delivery of one channel message. */
export function createChannelRecipientPlan(prisma: PrismaService, roles: RolesService, serverId: string, channelId: string, senderId: string | null) {
  let members: Promise<Member[]> | undefined
  let permissions: Promise<Map<string, bigint>> | undefined
  const getMembers = () => members ??= prisma.serverMember.findMany({
    where: { serverId, ...(senderId ? { NOT: { userId: senderId } } : {}) },
    select: { userId: true, notifLevel: true, user: { select: { isBot: true } } }
  }).then(rows => rows.map(m => ({ userId: m.userId, notifLevel: m.notifLevel, isBot: m.user?.isBot ?? false })))
  return {
    members: getMembers,
    async permissionsFor(userIds: string[]) {
      if (!userIds.length) return new Map<string, bigint>()
      permissions ??= getMembers().then(rows => roles.getChannelPermissionsForUsers(serverId, channelId, rows.map(m => m.userId)))
      const result = await permissions
      return new Map(userIds.flatMap(id => result.has(id) ? [[id, result.get(id)!] as const] : []))
    }
  }
}

export type ChannelRecipientPlan = ReturnType<typeof createChannelRecipientPlan>
