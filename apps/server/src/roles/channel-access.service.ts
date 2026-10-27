import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { canonicalChannelRules, Permission, saveChannelAccessSchema, type ChannelAccessContext } from '@chat/shared'
import { Prisma } from '../prisma-client'
import { PrismaService } from '../prisma/prisma.service'
import { EventBusService } from '../events/event-bus.service'
import { RolesService } from './roles.service'

@Injectable()
export class ChannelAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly roles: RolesService,
    private readonly events: EventBusService
  ) {}

  async getContext(serverId: string, channelId: string, actorId: string): Promise<ChannelAccessContext> {
    await this.roles.requirePermission(serverId, actorId, Permission.MANAGE_ROLES)
    return this.prisma.$transaction(
      async (tx) => {
        const channel = await tx.channel.findFirst({ where: { id: channelId, serverId }, select: { id: true } })
        if (!channel) throw new NotFoundException('Channel not found')
        const [server, roles, overrides, members] = await Promise.all([
          tx.server.findUniqueOrThrow({ where: { id: serverId }, select: { ownerId: true } }),
          tx.role.findMany({ where: { serverId }, orderBy: { position: 'desc' } }),
          tx.channelPermissionOverride.findMany({ where: { channelId } }),
          tx.serverMember.findMany({
            where: { serverId },
            orderBy: { userId: 'asc' },
            select: {
              userId: true,
              displayName: true,
              roles: { select: { roleId: true } },
              user: { select: { username: true, displayName: true, avatarUrl: true } }
            }
          })
        ])
        return {
          ownerId: server.ownerId,
          roles: roles.map((role) => this.roles.mapToWire(role)),
          overrides: overrides.map((rule) => ({
            roleId: rule.roleId,
            allow: rule.allow.toString(),
            deny: rule.deny.toString()
          })),
          members: members.map((member) => ({
            userId: member.userId,
            username: member.user.username,
            displayName: member.displayName ?? member.user.displayName,
            avatarUrl: member.user.avatarUrl,
            roleIds: member.roles.map((role) => role.roleId)
          }))
        }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
    )
  }

  async save(serverId: string, channelId: string, actorId: string, body: unknown) {
    await this.roles.requirePermission(serverId, actorId, Permission.MANAGE_ROLES)
    const parsed = saveChannelAccessSchema.safeParse(body)
    if (!parsed.success) throw new BadRequestException('Invalid channel access rules')
    const { overrides, expectedOverrides } = parsed.data
    try {
      await this.prisma.$transaction(
        async (tx) => {
          const channel = await tx.channel.findFirst({ where: { id: channelId, serverId }, select: { id: true } })
          if (!channel) throw new NotFoundException('Channel not found')
          const existing = await tx.channelPermissionOverride.findMany({ where: { channelId } })
          const wire = existing.map((rule) => ({
            roleId: rule.roleId,
            allow: rule.allow.toString(),
            deny: rule.deny.toString()
          }))
          if (canonicalChannelRules(wire) !== canonicalChannelRules(expectedOverrides)) {
            throw new ConflictException('Channel permissions changed. Reload access before saving.')
          }
          const roleIds = overrides.map((rule) => rule.roleId)
          const roles = await tx.role.findMany({ where: { serverId, id: { in: roleIds } }, select: { id: true } })
          if (roles.length !== roleIds.length) throw new BadRequestException('A role no longer belongs to this server')
          await tx.channelPermissionOverride.deleteMany({ where: { channelId } })
          if (overrides.length)
            await tx.channelPermissionOverride.createMany({
              data: overrides.map((rule) => ({
                channelId,
                roleId: rule.roleId,
                allow: BigInt(rule.allow),
                deny: BigInt(rule.deny)
              }))
            })
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      )
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
        throw new ConflictException('Channel permissions changed. Reload access before saving.')
      }
      throw error
    }
    this.events.emit('channel:permissions:updated', { serverId, channelId })
    return { overrides }
  }
}
