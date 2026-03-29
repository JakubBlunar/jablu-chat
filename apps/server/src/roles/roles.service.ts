import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import {
  DEFAULT_EVERYONE_PERMISSIONS,
  DEFAULT_OWNER_PERMISSIONS,
  Permission,
  hasPermission,
  resolveChannelPermissions,
} from '@chat/shared'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  async createDefaultRoles(serverId: string, ownerId: string): Promise<{ ownerRoleId: string; everyoneRoleId: string }> {
    const ownerRole = await this.prisma.role.create({
      data: {
        serverId,
        name: 'Owner',
        color: '#f59e0b',
        position: 100,
        permissions: DEFAULT_OWNER_PERMISSIONS,
        isDefault: false,
      },
    })

    const everyoneRole = await this.prisma.role.create({
      data: {
        serverId,
        name: '@everyone',
        position: 0,
        permissions: DEFAULT_EVERYONE_PERMISSIONS,
        isDefault: true,
      },
    })

    return { ownerRoleId: ownerRole.id, everyoneRoleId: everyoneRole.id }
  }

  async getDefaultRoleId(serverId: string): Promise<string> {
    const role = await this.prisma.role.findFirst({
      where: { serverId, isDefault: true },
      select: { id: true },
    })
    if (!role) throw new NotFoundException('Default role not found for server')
    return role.id
  }

  async getRoles(serverId: string) {
    const roles = await this.prisma.role.findMany({
      where: { serverId },
      orderBy: { position: 'desc' },
    })
    return roles.map(this.mapToWire)
  }

  async createRole(serverId: string, actorId: string, data: { name: string; color?: string; permissions?: string }) {
    await this.requirePermission(serverId, actorId, Permission.MANAGE_ROLES)

    const maxPos = await this.prisma.role.aggregate({
      where: { serverId },
      _max: { position: true },
    })
    const position = (maxPos._max.position ?? 0) + 1

    const role = await this.prisma.role.create({
      data: {
        serverId,
        name: data.name,
        color: data.color ?? null,
        position,
        permissions: data.permissions ? BigInt(data.permissions) : DEFAULT_EVERYONE_PERMISSIONS,
      },
    })

    return this.mapToWire(role)
  }

  async updateRole(serverId: string, roleId: string, actorId: string, data: { name?: string; color?: string | null; permissions?: string; position?: number }) {
    await this.requirePermission(serverId, actorId, Permission.MANAGE_ROLES)

    const role = await this.prisma.role.findFirst({
      where: { id: roleId, serverId },
    })
    if (!role) throw new NotFoundException('Role not found')

    const updated = await this.prisma.role.update({
      where: { id: roleId },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.color !== undefined && { color: data.color }),
        ...(data.permissions !== undefined && { permissions: BigInt(data.permissions) }),
        ...(data.position !== undefined && { position: data.position }),
      },
    })

    return this.mapToWire(updated)
  }

  async deleteRole(serverId: string, roleId: string, actorId: string) {
    await this.requirePermission(serverId, actorId, Permission.MANAGE_ROLES)

    const role = await this.prisma.role.findFirst({
      where: { id: roleId, serverId },
    })
    if (!role) throw new NotFoundException('Role not found')
    if (role.isDefault) throw new BadRequestException('Cannot delete the default role')

    const defaultRoleId = await this.getDefaultRoleId(serverId)

    await this.prisma.$transaction([
      this.prisma.serverMember.updateMany({
        where: { serverId, roleId },
        data: { roleId: defaultRoleId },
      }),
      this.prisma.role.delete({ where: { id: roleId } }),
    ])
  }

  async assignRole(serverId: string, targetUserId: string, roleId: string, actorId: string) {
    await this.requirePermission(serverId, actorId, Permission.MANAGE_ROLES)

    const role = await this.prisma.role.findFirst({
      where: { id: roleId, serverId },
    })
    if (!role) throw new NotFoundException('Role not found')

    const member = await this.prisma.serverMember.findUnique({
      where: { userId_serverId: { userId: targetUserId, serverId } },
    })
    if (!member) throw new NotFoundException('Member not found')

    return this.prisma.serverMember.update({
      where: { userId_serverId: { userId: targetUserId, serverId } },
      data: { roleId },
      include: {
        user: {
          select: { id: true, username: true, displayName: true, avatarUrl: true, bio: true, status: true, customStatus: true },
        },
        role: true,
      },
    })
  }

  async reorderRoles(serverId: string, actorId: string, roleIds: string[]) {
    await this.requirePermission(serverId, actorId, Permission.MANAGE_ROLES)

    const roles = await this.prisma.role.findMany({
      where: { id: { in: roleIds }, serverId },
      select: { id: true },
    })
    if (roles.length !== roleIds.length) {
      throw new BadRequestException('Some role IDs do not belong to this server')
    }

    await this.prisma.$transaction(
      roleIds.map((id, i) =>
        this.prisma.role.update({ where: { id }, data: { position: roleIds.length - i } })
      )
    )
  }

  async getMemberPermissions(serverId: string, userId: string): Promise<bigint> {
    const server = await this.prisma.server.findUnique({
      where: { id: serverId },
      select: { ownerId: true },
    })
    if (!server) throw new NotFoundException('Server not found')
    if (server.ownerId === userId) return DEFAULT_OWNER_PERMISSIONS

    const member = await this.prisma.serverMember.findUnique({
      where: { userId_serverId: { userId, serverId } },
      include: { role: true },
    })
    if (!member) throw new ForbiddenException('You are not a member of this server')

    return member.role.permissions
  }

  async getChannelPermissions(serverId: string, channelId: string, userId: string): Promise<bigint> {
    const rolePerms = await this.getMemberPermissions(serverId, userId)
    if (hasPermission(rolePerms, Permission.ADMINISTRATOR)) return DEFAULT_OWNER_PERMISSIONS

    const member = await this.prisma.serverMember.findUnique({
      where: { userId_serverId: { userId, serverId } },
      select: { roleId: true },
    })
    if (!member) throw new ForbiddenException('You are not a member of this server')

    const override = await this.prisma.channelPermissionOverride.findUnique({
      where: { channelId_roleId: { channelId, roleId: member.roleId } },
    })

    if (!override) return rolePerms
    return resolveChannelPermissions(rolePerms, { allow: override.allow, deny: override.deny })
  }

  async requirePermission(serverId: string, userId: string, permission: bigint) {
    const perms = await this.getMemberPermissions(serverId, userId)
    if (!hasPermission(perms, permission)) {
      throw new ForbiddenException('Insufficient permissions')
    }
    return perms
  }

  async requireChannelPermission(serverId: string, channelId: string, userId: string, permission: bigint) {
    const perms = await this.getChannelPermissions(serverId, channelId, userId)
    if (!hasPermission(perms, permission)) {
      throw new ForbiddenException('Insufficient permissions')
    }
    return perms
  }

  async requireMembership(serverId: string, userId: string) {
    const server = await this.prisma.server.findUnique({ where: { id: serverId } })
    if (!server) throw new NotFoundException('Server not found')
    const membership = await this.prisma.serverMember.findUnique({
      where: { userId_serverId: { userId, serverId } },
    })
    if (!membership) throw new ForbiddenException('You are not a member of this server')
    return { server, membership }
  }

  async getChannelOverrides(channelId: string) {
    const overrides = await this.prisma.channelPermissionOverride.findMany({
      where: { channelId },
      include: { role: { select: { id: true, name: true } } },
    })
    return overrides.map((o) => ({
      id: o.id,
      channelId: o.channelId,
      roleId: o.roleId,
      allow: o.allow.toString(),
      deny: o.deny.toString(),
      roleName: o.role.name,
    }))
  }

  async upsertChannelOverride(
    serverId: string,
    channelId: string,
    roleId: string,
    actorId: string,
    allow: string,
    deny: string
  ) {
    await this.requirePermission(serverId, actorId, Permission.MANAGE_ROLES)

    const channel = await this.prisma.channel.findFirst({ where: { id: channelId, serverId } })
    if (!channel) throw new NotFoundException('Channel not found')

    const role = await this.prisma.role.findFirst({ where: { id: roleId, serverId } })
    if (!role) throw new NotFoundException('Role not found')

    const override = await this.prisma.channelPermissionOverride.upsert({
      where: { channelId_roleId: { channelId, roleId } },
      create: { channelId, roleId, allow: BigInt(allow), deny: BigInt(deny) },
      update: { allow: BigInt(allow), deny: BigInt(deny) },
    })

    return {
      id: override.id,
      channelId: override.channelId,
      roleId: override.roleId,
      allow: override.allow.toString(),
      deny: override.deny.toString(),
    }
  }

  async deleteChannelOverride(serverId: string, channelId: string, roleId: string, actorId: string) {
    await this.requirePermission(serverId, actorId, Permission.MANAGE_ROLES)

    await this.prisma.channelPermissionOverride.deleteMany({
      where: { channelId, roleId },
    })
  }

  private mapToWire(role: { id: string; serverId: string; name: string; color: string | null; position: number; permissions: bigint; isDefault: boolean; createdAt: Date }) {
    return {
      id: role.id,
      serverId: role.serverId,
      name: role.name,
      color: role.color,
      position: role.position,
      permissions: role.permissions.toString(),
      isDefault: role.isDefault,
      createdAt: role.createdAt.toISOString(),
    }
  }
}
