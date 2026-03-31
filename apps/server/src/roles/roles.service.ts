import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import {
  DANGEROUS_PERMISSIONS,
  DEFAULT_EVERYONE_PERMISSIONS,
  DEFAULT_OWNER_PERMISSIONS,
  Permission,
  hasPermission,
  resolveMultiRoleChannelPermissions,
  resolveMultiRolePermissions,
} from '@chat/shared'
import { EventBusService } from '../events/event-bus.service'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventBusService,
  ) {}

  async createDefaultRoles(serverId: string, _ownerId: string): Promise<{ ownerRoleId: string; everyoneRoleId: string }> {
    const ownerRole = await this.prisma.role.create({
      data: {
        serverId,
        name: 'Owner',
        color: '#f59e0b',
        position: 100,
        permissions: DEFAULT_OWNER_PERMISSIONS,
        isDefault: false,
        isAdmin: true,
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
    const actorPerms = await this.requirePermission(serverId, actorId, Permission.MANAGE_ROLES)
    const isOwner = await this.isServerOwner(serverId, actorId)

    const requestedPerms = data.permissions ? BigInt(data.permissions) : DEFAULT_EVERYONE_PERMISSIONS

    if (!isOwner) {
      this.enforcePermissionCeiling(actorPerms, requestedPerms)
    }

    const actorTopPos = isOwner ? Infinity : await this.getActorTopPosition(serverId, actorId)
    const maxPos = await this.prisma.role.aggregate({
      where: { serverId },
      _max: { position: true },
    })
    const position = Math.min((maxPos._max.position ?? 0) + 1, actorTopPos - 1)

    const role = await this.prisma.role.create({
      data: {
        serverId,
        name: data.name,
        color: data.color ?? null,
        position: Math.max(1, position),
        permissions: requestedPerms,
      },
    })

    const wire = this.mapToWire(role)
    this.events.emit('role:created', { serverId, role: wire })
    return wire
  }

  async updateRole(
    serverId: string,
    roleId: string,
    actorId: string,
    data: { name?: string; color?: string | null; permissions?: string; position?: number; selfAssignable?: boolean; isAdmin?: boolean },
  ) {
    const actorPerms = await this.requirePermission(serverId, actorId, Permission.MANAGE_ROLES)
    const isOwner = await this.isServerOwner(serverId, actorId)

    const role = await this.prisma.role.findFirst({ where: { id: roleId, serverId } })
    if (!role) throw new NotFoundException('Role not found')

    if (!isOwner) {
      const actorTopPos = await this.getActorTopPosition(serverId, actorId)
      if (role.position >= actorTopPos) {
        throw new ForbiddenException('Cannot edit a role at or above your own position')
      }
    }

    await this.enforceOwnerRoleProtection(serverId, role, isOwner)

    if (data.permissions !== undefined && !isOwner) {
      this.enforcePermissionCeiling(actorPerms, BigInt(data.permissions))
    }

    if (data.selfAssignable === true) {
      const permsToCheck = data.permissions !== undefined ? BigInt(data.permissions) : role.permissions
      if (permsToCheck & DANGEROUS_PERMISSIONS) {
        throw new BadRequestException('Cannot mark a role with dangerous permissions as self-assignable')
      }
    }

    const updated = await this.prisma.role.update({
      where: { id: roleId },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.color !== undefined && { color: data.color }),
        ...(data.permissions !== undefined && { permissions: BigInt(data.permissions) }),
        ...(data.position !== undefined && { position: data.position }),
        ...(data.selfAssignable !== undefined && { selfAssignable: data.selfAssignable }),
        ...(data.isAdmin !== undefined && { isAdmin: data.isAdmin }),
      },
    })

    const wire = this.mapToWire(updated)
    this.events.emit('role:updated', { serverId, role: wire })
    return wire
  }

  async deleteRole(serverId: string, roleId: string, actorId: string) {
    const _actorPerms = await this.requirePermission(serverId, actorId, Permission.MANAGE_ROLES)
    const isOwner = await this.isServerOwner(serverId, actorId)

    const role = await this.prisma.role.findFirst({ where: { id: roleId, serverId } })
    if (!role) throw new NotFoundException('Role not found')
    if (role.isDefault) throw new BadRequestException('Cannot delete the default role')

    if (!isOwner) {
      const actorTopPos = await this.getActorTopPosition(serverId, actorId)
      if (role.position >= actorTopPos) {
        throw new ForbiddenException('Cannot delete a role at or above your own position')
      }
    }

    await this.enforceOwnerRoleProtection(serverId, role, isOwner)

    const affectedMembers = await this.prisma.serverMemberRole.findMany({
      where: { serverId, roleId },
      select: { userId: true },
    })

    await this.prisma.$transaction([
      this.prisma.serverMemberRole.deleteMany({ where: { serverId, roleId } }),
      this.prisma.role.delete({ where: { id: roleId } }),
    ])

    this.events.emit('role:deleted', { serverId, roleId })

    for (const m of affectedMembers) {
      const memberRoles = await this.loadMemberRolesWire(serverId, m.userId)
      this.events.emit('member:updated', {
        serverId,
        userId: m.userId,
        roleIds: memberRoles.map((r) => r.id),
        roles: memberRoles,
      })
    }
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
        this.prisma.role.update({ where: { id }, data: { position: roleIds.length - i } }),
      ),
    )

    const updatedRoles = await this.getRoles(serverId)
    this.events.emit('roles:reordered', { serverId, roles: updatedRoles })
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
      include: { roles: { include: { role: true } } },
    })
    if (!member) throw new ForbiddenException('You are not a member of this server')

    const everyoneRole = await this.prisma.role.findFirst({
      where: { serverId, isDefault: true },
      select: { permissions: true },
    })

    const rolePermsList = member.roles.map((mr) => ({ permissions: mr.role.permissions }))
    if (everyoneRole) rolePermsList.push({ permissions: everyoneRole.permissions })

    return resolveMultiRolePermissions(rolePermsList)
  }

  async getChannelPermissions(serverId: string, channelId: string, userId: string): Promise<bigint> {
    const rolePerms = await this.getMemberPermissions(serverId, userId)
    if (hasPermission(rolePerms, Permission.ADMINISTRATOR)) return DEFAULT_OWNER_PERMISSIONS

    const roleIds = await this.getMemberRoleIds(serverId, userId)

    const overrides = await this.prisma.channelPermissionOverride.findMany({
      where: { channelId, roleId: { in: roleIds } },
    })

    if (overrides.length === 0) return rolePerms
    return resolveMultiRoleChannelPermissions(
      rolePerms,
      overrides.map((o) => ({ allow: o.allow, deny: o.deny })),
    )
  }

  async getAllChannelPermissions(serverId: string, userId: string): Promise<Record<string, bigint>> {
    const rolePerms = await this.getMemberPermissions(serverId, userId)

    const channels = await this.prisma.channel.findMany({
      where: { serverId },
      select: { id: true },
    })

    if (hasPermission(rolePerms, Permission.ADMINISTRATOR)) {
      const map: Record<string, bigint> = {}
      for (const ch of channels) map[ch.id] = DEFAULT_OWNER_PERMISSIONS
      return map
    }

    const roleIds = await this.getMemberRoleIds(serverId, userId)

    const overrides = await this.prisma.channelPermissionOverride.findMany({
      where: { roleId: { in: roleIds }, channelId: { in: channels.map((c) => c.id) } },
    })

    const overridesByChannel = new Map<string, { allow: bigint; deny: bigint }[]>()
    for (const o of overrides) {
      const list = overridesByChannel.get(o.channelId) ?? []
      list.push({ allow: o.allow, deny: o.deny })
      overridesByChannel.set(o.channelId, list)
    }

    const map: Record<string, bigint> = {}
    for (const ch of channels) {
      const channelOverrides = overridesByChannel.get(ch.id)
      map[ch.id] = channelOverrides
        ? resolveMultiRoleChannelPermissions(rolePerms, channelOverrides)
        : rolePerms
    }
    return map
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
    deny: string,
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

    this.events.emit('channel:permissions:updated', { serverId, channelId, roleId })

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

    this.events.emit('channel:permissions:updated', { serverId, channelId, roleId })
  }

  async loadMemberRolesWire(serverId: string, userId: string) {
    const memberRoles = await this.prisma.serverMemberRole.findMany({
      where: { userId, serverId },
      include: { role: true },
    })
    return memberRoles.map((mr) => this.mapToWire(mr.role))
  }

  mapToWire(role: { id: string; serverId: string; name: string; color: string | null; position: number; permissions: bigint; isDefault: boolean; selfAssignable: boolean; isAdmin: boolean; createdAt: Date }) {
    return {
      id: role.id,
      serverId: role.serverId,
      name: role.name,
      color: role.color,
      position: role.position,
      permissions: role.permissions.toString(),
      isDefault: role.isDefault,
      selfAssignable: role.selfAssignable,
      isAdmin: role.isAdmin,
      createdAt: role.createdAt.toISOString(),
    }
  }

  private async getMemberRoleIds(serverId: string, userId: string): Promise<string[]> {
    const memberRoles = await this.prisma.serverMemberRole.findMany({
      where: { userId, serverId },
      select: { roleId: true },
    })
    const ids = memberRoles.map((mr) => mr.roleId)
    const everyoneRole = await this.prisma.role.findFirst({
      where: { serverId, isDefault: true },
      select: { id: true },
    })
    if (everyoneRole) ids.push(everyoneRole.id)
    return ids
  }

  private async isServerOwner(serverId: string, userId: string): Promise<boolean> {
    const server = await this.prisma.server.findUnique({
      where: { id: serverId },
      select: { ownerId: true },
    })
    return server?.ownerId === userId
  }

  private async getActorTopPosition(serverId: string, actorId: string): Promise<number> {
    const memberRoles = await this.prisma.serverMemberRole.findMany({
      where: { userId: actorId, serverId },
      include: { role: { select: { position: true } } },
    })
    if (memberRoles.length === 0) return 0
    return Math.max(...memberRoles.map((mr) => mr.role.position))
  }

  private enforcePermissionCeiling(actorPerms: bigint, requestedPerms: bigint) {
    if (hasPermission(actorPerms, Permission.ADMINISTRATOR)) return
    const forbidden = requestedPerms & ~actorPerms
    if (forbidden) {
      throw new ForbiddenException('Cannot grant permissions you do not have')
    }
  }

  private async enforceOwnerRoleProtection(
    serverId: string,
    role: { id: string; position: number; isDefault: boolean },
    isOwner: boolean,
  ) {
    const ownerRoleCheck = await this.prisma.serverMemberRole.findFirst({
      where: { serverId, roleId: role.id },
      include: { member: { select: { userId: true } } },
    })
    if (ownerRoleCheck) {
      const server = await this.prisma.server.findUnique({
        where: { id: serverId },
        select: { ownerId: true },
      })
      if (server && server.ownerId === ownerRoleCheck.member.userId && role.position >= 100) {
        if (!isOwner) {
          throw new ForbiddenException('Only the server owner can modify the Owner role')
        }
      }
    }
  }
}
