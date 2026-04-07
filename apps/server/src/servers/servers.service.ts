import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { ChannelType, Prisma } from '@prisma/client'
import { DANGEROUS_PERMISSIONS, hasPermission, Permission } from '@chat/shared'
import { EventBusService } from '../events/event-bus.service'
import { PrismaService } from '../prisma/prisma.service'
import { RolesService } from '../roles/roles.service'
import { UploadsService } from '../uploads/uploads.service'
import { AuditLogService } from './audit-log.service'

const memberUserSelect = {
  id: true,
  username: true,
  displayName: true,
  avatarUrl: true,
  bio: true,
  isBot: true,
  status: true,
  customStatus: true
} as const

const memberInclude = {
  user: { select: memberUserSelect },
  roles: { include: { role: true } }
} as const

@Injectable()
export class ServersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploads: UploadsService,
    private readonly auditLog: AuditLogService,
    private readonly events: EventBusService,
    private readonly roles: RolesService
  ) {}

  private async getServerOrThrow(serverId: string) {
    const server = await this.prisma.server.findUnique({
      where: { id: serverId }
    })
    if (!server) {
      throw new NotFoundException('Server not found')
    }
    return server
  }

  private async requireMembership(serverId: string, userId: string) {
    await this.getServerOrThrow(serverId)
    const membership = await this.prisma.serverMember.findUnique({
      where: {
        userId_serverId: { userId, serverId }
      }
    })
    if (!membership) {
      throw new ForbiddenException('You are not a member of this server')
    }
    return membership
  }

  async createServer(userId: string, name: string) {
    const server = await this.prisma.server.create({
      data: {
        name,
        ownerId: userId,
        channels: {
          create: [
            { name: 'general', type: ChannelType.text, position: 0 },
            { name: 'General', type: ChannelType.voice, position: 1 }
          ]
        }
      }
    })

    const { ownerRoleId } = await this.roles.createDefaultRoles(server.id, userId)

    await this.prisma.serverMember.create({
      data: { userId, serverId: server.id }
    })
    await this.prisma.serverMemberRole.create({
      data: { userId, serverId: server.id, roleId: ownerRoleId }
    })

    return this.prisma.server.findUnique({
      where: { id: server.id },
      include: {
        channels: { orderBy: { position: 'asc' } },
        categories: { orderBy: { position: 'asc' } },
        roles: { orderBy: { position: 'desc' } },
        members: { include: memberInclude }
      }
    })
  }

  async getServers(userId: string) {
    const servers = await this.prisma.server.findMany({
      where: {
        members: { some: { userId } }
      },
      include: {
        _count: { select: { members: true } }
      },
      orderBy: { name: 'asc' }
    })
    return servers.map(({ _count, ...server }) => ({
      ...server,
      memberCount: _count.members
    }))
  }

  async getServer(serverId: string, userId: string) {
    const server = await this.prisma.server.findFirst({
      where: { id: serverId, members: { some: { userId } } },
      include: {
        channels: { orderBy: { position: 'asc' } },
        categories: { orderBy: { position: 'asc' } },
        roles: { orderBy: { position: 'desc' } },
        members: {
          include: memberInclude,
          orderBy: { joinedAt: 'asc' }
        }
      }
    })
    if (!server) {
      throw new NotFoundException('Server not found or you are not a member')
    }
    const permMap = await this.roles.getAllChannelPermissions(serverId, userId)
    const visibleChannelIds = new Set(
      Object.entries(permMap)
        .filter(([, p]) => hasPermission(p, Permission.VIEW_CHANNEL))
        .map(([id]) => id)
    )
    return { ...server, channels: server.channels.filter((c) => visibleChannelIds.has(c.id)) }
  }

  async updateServer(serverId: string, userId: string, data: {
    name?: string
    vanityCode?: string | null
    welcomeChannelId?: string | null
    welcomeMessage?: string | null
    afkChannelId?: string | null
    afkTimeout?: number
  }) {
    await this.roles.requirePermission(serverId, userId, Permission.MANAGE_SERVER)

    const updateData: Record<string, unknown> = {}
    const details: string[] = []

    if (data.name !== undefined) {
      updateData.name = data.name
      details.push(`Renamed to "${data.name}"`)
    }

    if (data.vanityCode !== undefined) {
      if (data.vanityCode !== null) {
        if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(data.vanityCode) || data.vanityCode.length < 3 || data.vanityCode.length > 32) {
          throw new BadRequestException('Vanity code must be 3-32 lowercase alphanumeric characters and hyphens')
        }
      }
      updateData.vanityCode = data.vanityCode
      details.push(data.vanityCode ? `Vanity URL set to "${data.vanityCode}"` : 'Vanity URL removed')
    }

    if (data.welcomeChannelId !== undefined) {
      if (data.welcomeChannelId) {
        const ch = await this.prisma.channel.findFirst({ where: { id: data.welcomeChannelId, serverId, type: 'text' } })
        if (!ch) throw new BadRequestException('Welcome channel must be a text channel in this server')
      }
      updateData.welcomeChannelId = data.welcomeChannelId
    }
    if (data.welcomeMessage !== undefined) {
      updateData.welcomeMessage = data.welcomeMessage
    }

    if (data.afkChannelId !== undefined) {
      if (data.afkChannelId) {
        const ch = await this.prisma.channel.findFirst({ where: { id: data.afkChannelId, serverId, type: 'voice' } })
        if (!ch) throw new BadRequestException('AFK channel must be a voice channel in this server')
      }
      updateData.afkChannelId = data.afkChannelId
    }
    if (data.afkTimeout !== undefined) {
      updateData.afkTimeout = data.afkTimeout
    }

    if (Object.keys(updateData).length === 0) {
      return this.getServer(serverId, userId)
    }

    try {
      const result = await this.prisma.server.update({
        where: { id: serverId },
        data: updateData,
        include: {
          channels: { orderBy: { position: 'asc' } },
          categories: { orderBy: { position: 'asc' } },
          roles: { orderBy: { position: 'desc' } },
          members: { include: memberInclude }
        }
      })
      if (details.length > 0) {
        await this.auditLog.log(serverId, userId, 'server.update', 'server', serverId, details.join('; '))
      }
      const patch: Record<string, unknown> = { serverId }
      if (data.name) patch.name = data.name
      if (data.vanityCode !== undefined) patch.vanityCode = result.vanityCode
      if (data.welcomeChannelId !== undefined) patch.welcomeChannelId = result.welcomeChannelId
      if (data.welcomeMessage !== undefined) patch.welcomeMessage = result.welcomeMessage
      if (data.afkChannelId !== undefined) patch.afkChannelId = result.afkChannelId
      if (data.afkTimeout !== undefined) patch.afkTimeout = result.afkTimeout
      if (Object.keys(patch).length > 1) {
        this.events.emit('server:updated', patch)
      }
      return result
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('This vanity URL is already taken')
      }
      throw e
    }
  }

  async uploadIcon(serverId: string, userId: string, file: Express.Multer.File) {
    await this.roles.requirePermission(serverId, userId, Permission.MANAGE_SERVER)
    const server = await this.getServerOrThrow(serverId)
    if (server.iconUrl) {
      this.uploads.deleteFile(server.iconUrl)
    }
    const iconUrl = await this.uploads.saveAvatar(file)
    const result = await this.prisma.server.update({
      where: { id: serverId },
      data: { iconUrl }
    })
    await this.auditLog.log(serverId, userId, 'server.icon.update', 'server', serverId)
    this.events.emit('server:updated', { serverId, iconUrl })
    return result
  }

  async deleteIcon(serverId: string, userId: string) {
    await this.roles.requirePermission(serverId, userId, Permission.MANAGE_SERVER)
    const server = await this.getServerOrThrow(serverId)
    if (server.iconUrl) {
      this.uploads.deleteFile(server.iconUrl)
    }
    const result = await this.prisma.server.update({
      where: { id: serverId },
      data: { iconUrl: null }
    })
    this.events.emit('server:updated', { serverId, iconUrl: null })
    return result
  }

  async updateMemberRoles(serverId: string, actorId: string, targetUserId: string, roleIds: string[]) {
    await this.roles.requirePermission(serverId, actorId, Permission.MANAGE_ROLES)
    if (targetUserId === actorId) {
      throw new ForbiddenException('You cannot change your own roles')
    }
    const server = await this.getServerOrThrow(serverId)
    const isOwner = server.ownerId === actorId

    const target = await this.prisma.serverMember.findUnique({
      where: { userId_serverId: { userId: targetUserId, serverId } }
    })
    if (!target) throw new NotFoundException('Member not found')

    const validRoles = await this.prisma.role.findMany({
      where: { id: { in: roleIds }, serverId, isDefault: false }
    })
    if (validRoles.length !== roleIds.length) {
      throw new BadRequestException('Some role IDs are invalid')
    }

    if (!isOwner) {
      const actorTopPos = await this.roles.getActorTopPosition(serverId, actorId)
      for (const role of validRoles) {
        if (role.position >= actorTopPos) {
          throw new ForbiddenException('Cannot assign a role at or above your own position')
        }
      }
    }

    const ownerRoleId = await this.roles.getOwnerRoleId(serverId)
    if (server.ownerId === targetUserId && ownerRoleId && !roleIds.includes(ownerRoleId)) {
      throw new ForbiddenException('Cannot remove the Owner role from the server owner')
    }

    await this.prisma.$transaction([
      this.prisma.serverMemberRole.deleteMany({
        where: { userId: targetUserId, serverId }
      }),
      ...roleIds.map((roleId) =>
        this.prisma.serverMemberRole.create({
          data: { userId: targetUserId, serverId, roleId }
        })
      )
    ])

    const memberRoles = await this.roles.loadMemberRolesWire(serverId, targetUserId)
    await this.auditLog.log(serverId, actorId, 'member.role.update', 'user', targetUserId, `Roles: ${memberRoles.map((r) => r.name).join(', ')}`)
    this.events.emit('member:updated', {
      serverId,
      userId: targetUserId,
      roleIds: memberRoles.map((r) => r.id),
      roles: memberRoles
    })

    return this.prisma.serverMember.findUnique({
      where: { userId_serverId: { userId: targetUserId, serverId } },
      include: memberInclude
    })
  }

  async kickMember(serverId: string, actorId: string, targetUserId: string) {
    await this.roles.requirePermission(serverId, actorId, Permission.KICK_MEMBERS)
    const server = await this.getServerOrThrow(serverId)
    if (targetUserId === server.ownerId) {
      throw new ForbiddenException('Cannot kick the server owner')
    }
    if (targetUserId === actorId) {
      throw new ForbiddenException('You cannot kick yourself')
    }
    const target = await this.prisma.serverMember.findUnique({
      where: { userId_serverId: { userId: targetUserId, serverId } }
    })
    if (!target) {
      throw new NotFoundException('Member not found')
    }
    await this.prisma.messageBookmark.deleteMany({
      where: { userId: targetUserId, message: { channel: { serverId } } }
    })
    await this.prisma.serverMember.delete({
      where: { userId_serverId: { userId: targetUserId, serverId } }
    })
    await this.auditLog.log(serverId, actorId, 'member.kick', 'user', targetUserId)
    this.events.emit('member:removed', { serverId, userId: targetUserId })
  }

  async banMember(serverId: string, actorId: string, targetUserId: string, reason?: string) {
    await this.roles.requirePermission(serverId, actorId, Permission.BAN_MEMBERS)
    const server = await this.getServerOrThrow(serverId)
    if (targetUserId === server.ownerId) {
      throw new ForbiddenException('Cannot ban the server owner')
    }
    if (targetUserId === actorId) {
      throw new ForbiddenException('You cannot ban yourself')
    }
    const existing = await this.prisma.serverBan.findUnique({
      where: { serverId_userId: { serverId, userId: targetUserId } }
    })
    if (existing) {
      throw new BadRequestException('User is already banned')
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.serverBan.create({
        data: { serverId, userId: targetUserId, bannedBy: actorId, reason: reason?.trim() || null }
      })
      await tx.messageBookmark.deleteMany({
        where: { userId: targetUserId, message: { channel: { serverId } } }
      })
      await tx.serverMember.deleteMany({
        where: { userId: targetUserId, serverId }
      })
    })

    await this.auditLog.log(serverId, actorId, 'member.ban', 'user', targetUserId, reason)
    this.events.emit('member:removed', { serverId, userId: targetUserId })
  }

  async timeoutMember(serverId: string, actorId: string, targetUserId: string, durationSeconds: number) {
    await this.roles.requirePermission(serverId, actorId, Permission.MUTE_MEMBERS)
    const server = await this.getServerOrThrow(serverId)
    if (targetUserId === server.ownerId) {
      throw new ForbiddenException('Cannot timeout the server owner')
    }
    if (targetUserId === actorId) {
      throw new ForbiddenException('You cannot timeout yourself')
    }
    const target = await this.prisma.serverMember.findUnique({
      where: { userId_serverId: { userId: targetUserId, serverId } }
    })
    if (!target) throw new NotFoundException('Member not found')

    const mutedUntil = new Date(Date.now() + durationSeconds * 1000)
    await this.prisma.serverMember.update({
      where: { userId_serverId: { userId: targetUserId, serverId } },
      data: { mutedUntil }
    })
    await this.auditLog.log(serverId, actorId, 'member.timeout', 'user', targetUserId, `${durationSeconds}s`)
    this.events.emit('member:updated', { serverId, userId: targetUserId, mutedUntil: mutedUntil.toISOString() })
    return { mutedUntil: mutedUntil.toISOString() }
  }

  async removeTimeout(serverId: string, actorId: string, targetUserId: string) {
    await this.roles.requirePermission(serverId, actorId, Permission.MUTE_MEMBERS)
    const target = await this.prisma.serverMember.findUnique({
      where: { userId_serverId: { userId: targetUserId, serverId } }
    })
    if (!target) throw new NotFoundException('Member not found')

    await this.prisma.serverMember.update({
      where: { userId_serverId: { userId: targetUserId, serverId } },
      data: { mutedUntil: null }
    })
    await this.auditLog.log(serverId, actorId, 'member.timeout.remove', 'user', targetUserId)
    this.events.emit('member:updated', { serverId, userId: targetUserId, mutedUntil: null })
  }

  async isUserMuted(serverId: string, userId: string): Promise<boolean> {
    const member = await this.prisma.serverMember.findUnique({
      where: { userId_serverId: { userId, serverId } },
      select: { mutedUntil: true }
    })
    if (!member?.mutedUntil) return false
    return member.mutedUntil > new Date()
  }

  async unbanMember(serverId: string, actorId: string, targetUserId: string) {
    await this.roles.requirePermission(serverId, actorId, Permission.BAN_MEMBERS)
    const ban = await this.prisma.serverBan.findUnique({
      where: { serverId_userId: { serverId, userId: targetUserId } }
    })
    if (!ban) {
      throw new NotFoundException('Ban not found')
    }
    await this.prisma.serverBan.delete({ where: { id: ban.id } })
    await this.auditLog.log(serverId, actorId, 'member.unban', 'user', targetUserId)
  }

  async getBans(serverId: string, actorId: string) {
    await this.roles.requirePermission(serverId, actorId, Permission.BAN_MEMBERS)
    const bans = await this.prisma.serverBan.findMany({
      where: { serverId },
      include: {
        user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
        actor: { select: { id: true, username: true, displayName: true } }
      },
      orderBy: { createdAt: 'desc' }
    })
    return bans.map((b) => ({
      id: b.id,
      userId: b.userId,
      user: b.user,
      bannedBy: b.actor,
      reason: b.reason,
      createdAt: b.createdAt.toISOString()
    }))
  }

  async deleteServer(serverId: string, userId: string) {
    const server = await this.getServerOrThrow(serverId)
    if (server.ownerId !== userId) {
      throw new ForbiddenException('Only the server owner can delete the server')
    }

    if (server.iconUrl) {
      this.uploads.deleteFile(server.iconUrl)
    }

    const channelIds = await this.prisma.channel
      .findMany({ where: { serverId }, select: { id: true } })
      .then((chs) => chs.map((c) => c.id))

    const attachments = await this.prisma.attachment.findMany({
      where: { message: { channelId: { in: channelIds } } },
      select: { url: true, thumbnailUrl: true }
    })
    for (const a of attachments) {
      this.uploads.deleteFile(a.url)
      if (a.thumbnailUrl) this.uploads.deleteFile(a.thumbnailUrl)
    }

    const emojis = await this.prisma.customEmoji.findMany({
      where: { serverId },
      select: { imageUrl: true }
    })
    for (const e of emojis) {
      this.uploads.deleteFile(e.imageUrl)
    }

    await this.prisma.server.delete({ where: { id: serverId } })
  }

  async joinServer(serverId: string, userId: string) {
    await this.getServerOrThrow(serverId)
    const ban = await this.prisma.serverBan.findUnique({
      where: { serverId_userId: { serverId, userId } }
    })
    if (ban) {
      throw new ForbiddenException('You are banned from this server')
    }
    const existing = await this.prisma.serverMember.findUnique({
      where: {
        userId_serverId: { userId, serverId }
      }
    })
    if (existing) {
      return existing
    }
    const server = await this.prisma.server.findUniqueOrThrow({ where: { id: serverId }, select: { onboardingEnabled: true } })
    const member = await this.prisma.serverMember.create({
      data: {
        userId,
        serverId,
        onboardingCompleted: !server.onboardingEnabled
      },
      include: memberInclude
    })
    const everyoneRole = await this.prisma.role.findFirst({ where: { serverId, isDefault: true } })
    const enriched = everyoneRole
      ? { ...member, roles: [...member.roles, { userId, serverId, roleId: everyoneRole.id, role: everyoneRole }] }
      : member
    this.events.emit('member:joined', { serverId, member: enriched })
    return enriched
  }

  async leaveServer(serverId: string, userId: string) {
    const server = await this.getServerOrThrow(serverId)
    const membership = await this.prisma.serverMember.findUnique({
      where: {
        userId_serverId: { userId, serverId }
      }
    })
    if (!membership) {
      throw new NotFoundException('You are not a member of this server')
    }
    if (server.ownerId === userId) {
      throw new ForbiddenException('The server owner cannot leave the server')
    }
    await this.prisma.messageBookmark.deleteMany({
      where: { userId, message: { channel: { serverId } } }
    })
    await this.prisma.serverMember.delete({
      where: {
        userId_serverId: { userId, serverId }
      }
    })
    this.events.emit('member:removed', { serverId, userId })
  }

  async getMembers(serverId: string, userId: string) {
    await this.requireMembership(serverId, userId)
    const [members, everyoneRole] = await Promise.all([
      this.prisma.serverMember.findMany({
        where: { serverId },
        include: memberInclude,
        orderBy: { joinedAt: 'asc' }
      }),
      this.prisma.role.findFirst({ where: { serverId, isDefault: true } })
    ])
    if (!everyoneRole) return members
    return members.map((m) => {
      const hasEveryone = m.roles.some((r) => r.roleId === everyoneRole.id)
      if (hasEveryone) return m
      return {
        ...m,
        roles: [...m.roles, { userId: m.userId, serverId, roleId: everyoneRole.id, role: everyoneRole }]
      }
    })
  }

  async getEmojiStats(serverId: string, userId: string) {
    await this.requireMembership(serverId, userId)

    const channelIds = await this.prisma.channel.findMany({
      where: { serverId },
      select: { id: true }
    })
    const ids = channelIds.map((c) => c.id)

    if (ids.length === 0) return []

    const stats = await this.prisma.reaction.groupBy({
      by: ['emoji'],
      where: {
        isCustom: true,
        message: {
          channelId: { in: ids },
          deleted: false
        }
      },
      _count: { emoji: true },
      _max: { createdAt: true },
      orderBy: { _count: { emoji: 'desc' } },
      take: 50
    })

    const emojis = await this.prisma.customEmoji.findMany({
      where: { serverId },
      select: { name: true, imageUrl: true, createdAt: true }
    })
    const emojiMap = new Map(emojis.map((e) => [e.name, e]))

    return stats.map((s) => {
      const emoji = emojiMap.get(s.emoji)
      return {
        emoji: s.emoji,
        usageCount: s._count.emoji,
        lastUsed: s._max.createdAt?.toISOString() ?? null,
        imageUrl: emoji?.imageUrl ?? null,
        createdAt: emoji?.createdAt?.toISOString() ?? null
      }
    })
  }

  async getEmojis(serverId: string, userId: string) {
    await this.requireMembership(serverId, userId)
    return this.prisma.customEmoji.findMany({
      where: { serverId },
      orderBy: { createdAt: 'asc' }
    })
  }

  async uploadEmoji(serverId: string, userId: string, file: Express.Multer.File, name: string) {
    await this.roles.requirePermission(serverId, userId, Permission.MANAGE_EMOJIS)

    const sanitized = name.replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase()
    if (!sanitized || sanitized.length < 2 || sanitized.length > 32) {
      throw new BadRequestException('Emoji name must be 2-32 alphanumeric/underscore characters')
    }

    const existing = await this.prisma.customEmoji.findUnique({
      where: { serverId_name: { serverId, name: sanitized } }
    })
    if (existing) throw new BadRequestException(`Emoji :${sanitized}: already exists`)

    const count = await this.prisma.customEmoji.count({ where: { serverId } })
    if (count >= 50) throw new BadRequestException('Server emoji limit reached (50)')

    const imageUrl = await this.uploads.saveEmoji(file)
    const emoji = await this.prisma.customEmoji.create({
      data: { serverId, name: sanitized, imageUrl, uploadedById: userId }
    })

    await this.auditLog.log(serverId, userId, 'emoji.create', 'emoji', emoji.id, `:${sanitized}:`)
    this.events.emit('server:updated', { serverId })
    return emoji
  }

  async getOnboardingConfig(serverId: string, userId: string) {
    await this.roles.requirePermission(serverId, userId, Permission.MANAGE_SERVER)
    const server = await this.prisma.server.findUniqueOrThrow({
      where: { id: serverId },
      select: { onboardingEnabled: true, onboardingMessage: true }
    })
    const roles = await this.prisma.role.findMany({
      where: { serverId },
      orderBy: { position: 'desc' },
      select: { id: true, name: true, color: true, isDefault: true, selfAssignable: true, position: true }
    })
    return { ...server, roles }
  }

  async updateOnboardingConfig(
    serverId: string,
    userId: string,
    data: { enabled?: boolean; message?: string | null; selfAssignableRoleIds?: string[] }
  ) {
    await this.roles.requirePermission(serverId, userId, Permission.MANAGE_SERVER)

    if (data.enabled !== undefined || data.message !== undefined) {
      await this.prisma.server.update({
        where: { id: serverId },
        data: {
          ...(data.enabled !== undefined && { onboardingEnabled: data.enabled }),
          ...(data.message !== undefined && { onboardingMessage: data.message })
        }
      })
    }

    if (data.selfAssignableRoleIds !== undefined) {
      if (data.selfAssignableRoleIds.length > 0) {
        const candidateRoles = await this.prisma.role.findMany({
          where: { serverId, id: { in: data.selfAssignableRoleIds }, isDefault: false },
          select: { id: true, name: true, permissions: true }
        })
        for (const role of candidateRoles) {
          if (role.permissions & DANGEROUS_PERMISSIONS) {
            throw new BadRequestException(`Role "${role.name}" has dangerous permissions and cannot be self-assignable`)
          }
        }
      }
      await this.prisma.role.updateMany({
        where: { serverId, selfAssignable: true },
        data: { selfAssignable: false }
      })
      if (data.selfAssignableRoleIds.length > 0) {
        await this.prisma.role.updateMany({
          where: { serverId, id: { in: data.selfAssignableRoleIds }, isDefault: false },
          data: { selfAssignable: true }
        })
      }
    }

    this.events.emit('server:updated', { serverId })
    return this.getOnboardingConfig(serverId, userId)
  }

  async getOnboardingWizardData(serverId: string, userId: string) {
    await this.requireMembership(serverId, userId)
    const server = await this.prisma.server.findUniqueOrThrow({
      where: { id: serverId },
      select: { onboardingEnabled: true, onboardingMessage: true, name: true }
    })
    const roles = await this.prisma.role.findMany({
      where: { serverId, selfAssignable: true },
      orderBy: { position: 'desc' },
      select: { id: true, name: true, color: true }
    })
    return { ...server, roles }
  }

  async changeSelfRoles(serverId: string, userId: string, roleIds: string[]) {
    const member = await this.prisma.serverMember.findUnique({
      where: { userId_serverId: { userId, serverId } }
    })
    if (!member) throw new NotFoundException('Not a member of this server')

    const validRoles = await this.prisma.role.findMany({
      where: { id: { in: roleIds }, serverId, selfAssignable: true }
    })
    if (validRoles.length !== roleIds.length) {
      throw new ForbiddenException('Some roles are not self-assignable')
    }

    const server = await this.getServerOrThrow(serverId)
    const currentRoles = await this.prisma.serverMemberRole.findMany({
      where: { userId, serverId },
      include: { role: true }
    })

    const preservedRoleIds = currentRoles
      .filter((mr) => !mr.role.selfAssignable)
      .map((mr) => mr.roleId)

    const ownerRoleId = await this.roles.getOwnerRoleId(serverId)
    if (server.ownerId === userId && ownerRoleId && !preservedRoleIds.includes(ownerRoleId)) {
      preservedRoleIds.push(ownerRoleId)
    }

    const newRoleIds = [...new Set([...preservedRoleIds, ...roleIds])]

    await this.prisma.$transaction([
      this.prisma.serverMemberRole.deleteMany({ where: { userId, serverId } }),
      ...newRoleIds.map((roleId) =>
        this.prisma.serverMemberRole.create({ data: { userId, serverId, roleId } })
      )
    ])

    const memberRoles = await this.roles.loadMemberRolesWire(serverId, userId)
    this.events.emit('member:updated', {
      serverId,
      userId,
      roleIds: memberRoles.map((r) => r.id),
      roles: memberRoles
    })

    return this.prisma.serverMember.findUnique({
      where: { userId_serverId: { userId, serverId } },
      include: memberInclude
    })
  }

  async completeOnboarding(serverId: string, userId: string, roleIds?: string[]) {
    const member = await this.prisma.serverMember.findUnique({
      where: { userId_serverId: { userId, serverId } }
    })
    if (!member) throw new NotFoundException('Not a member of this server')
    if (member.onboardingCompleted) return member

    await this.prisma.serverMember.update({
      where: { userId_serverId: { userId, serverId } },
      data: { onboardingCompleted: true }
    })

    if (roleIds && roleIds.length > 0) {
      const validRoles = await this.prisma.role.findMany({
        where: { id: { in: roleIds }, serverId, selfAssignable: true }
      })
      await this.prisma.serverMemberRole.createMany({
        data: validRoles.map((role) => ({ userId, serverId, roleId: role.id })),
        skipDuplicates: true,
      })
    }

    const memberRoles = await this.roles.loadMemberRolesWire(serverId, userId)
    this.events.emit('member:updated', {
      serverId,
      userId,
      roleIds: memberRoles.map((r) => r.id),
      roles: memberRoles,
      onboardingCompleted: true
    })

    return this.prisma.serverMember.findUnique({
      where: { userId_serverId: { userId, serverId } },
      include: memberInclude
    })
  }

  async getInsights(serverId: string, userId: string) {
    await this.roles.requirePermission(serverId, userId, Permission.MANAGE_SERVER)

    const channelIds = (
      await this.prisma.channel.findMany({
        where: { serverId },
        select: { id: true }
      })
    ).map((c) => c.id)

    const now = new Date()
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

    const [
      totalMembers,
      totalChannels,
      totalMessages,
      messagesByDay,
      topChannelsRaw,
      topContributorsRaw,
      membersByWeek,
      channelBreakdown
    ] = await Promise.all([
      this.prisma.serverMember.count({ where: { serverId } }),
      this.prisma.channel.count({ where: { serverId } }),
      channelIds.length > 0
        ? this.prisma.message.count({
            where: { channelId: { in: channelIds }, deleted: false }
          })
        : Promise.resolve(0),

      channelIds.length > 0
        ? this.prisma.$queryRaw<{ day: string; count: bigint }[]>`
            SELECT DATE("created_at") AS day, COUNT(*)::bigint AS count
            FROM messages
            WHERE channel_id = ANY(${channelIds})
              AND deleted = false
              AND created_at >= ${thirtyDaysAgo}
            GROUP BY DATE("created_at")
            ORDER BY day
          `
        : Promise.resolve([]),

      channelIds.length > 0
        ? this.prisma.$queryRaw<{ channel_id: string; count: bigint }[]>`
            SELECT channel_id, COUNT(*)::bigint AS count
            FROM messages
            WHERE channel_id = ANY(${channelIds})
              AND deleted = false
              AND created_at >= ${thirtyDaysAgo}
            GROUP BY channel_id
            ORDER BY count DESC
            LIMIT 10
          `
        : Promise.resolve([]),

      channelIds.length > 0
        ? this.prisma.$queryRaw<{ author_id: string; count: bigint }[]>`
            SELECT author_id, COUNT(*)::bigint AS count
            FROM messages
            WHERE channel_id = ANY(${channelIds})
              AND deleted = false
              AND created_at >= ${thirtyDaysAgo}
            GROUP BY author_id
            ORDER BY count DESC
            LIMIT 10
          `
        : Promise.resolve([]),

      this.prisma.$queryRaw<{ week: string; count: bigint }[]>`
        SELECT DATE_TRUNC('week', joined_at)::date::text AS week, COUNT(*)::bigint AS count
        FROM server_members
        WHERE server_id = ANY(${[serverId]})
        GROUP BY DATE_TRUNC('week', joined_at)
        ORDER BY week
      `,

      this.prisma.channel.groupBy({
        by: ['type'],
        where: { serverId },
        _count: true
      })
    ])

    const channelMap = new Map(
      (
        await this.prisma.channel.findMany({
          where: { serverId },
          select: { id: true, name: true }
        })
      ).map((c) => [c.id, c.name])
    )

    const userIds = topContributorsRaw.map((r) => r.author_id)
    const userMap = new Map(
      userIds.length > 0
        ? (
            await this.prisma.user.findMany({
              where: { id: { in: userIds } },
              select: { id: true, username: true, displayName: true, avatarUrl: true }
            })
          ).map((u) => [u.id, u])
        : []
    )

    return {
      overview: {
        totalMembers,
        totalChannels,
        totalMessages,
        textChannels: channelBreakdown.find((c) => c.type === 'text')?._count ?? 0,
        voiceChannels: channelBreakdown.find((c) => c.type === 'voice')?._count ?? 0
      },
      messagesByDay: messagesByDay.map((r) => ({
        day: typeof r.day === 'string' ? r.day : new Date(r.day).toISOString().slice(0, 10),
        count: Number(r.count)
      })),
      topChannels: topChannelsRaw.map((r) => ({
        channelId: r.channel_id,
        name: channelMap.get(r.channel_id) ?? 'deleted',
        count: Number(r.count)
      })),
      topContributors: topContributorsRaw.map((r) => ({
        userId: r.author_id,
        username: userMap.get(r.author_id)?.username ?? 'deleted',
        displayName: userMap.get(r.author_id)?.displayName ?? null,
        avatarUrl: userMap.get(r.author_id)?.avatarUrl ?? null,
        count: Number(r.count)
      })),
      membersByWeek: membersByWeek.map((r) => ({
        week: r.week,
        count: Number(r.count)
      }))
    }
  }

  async renameEmoji(serverId: string, userId: string, emojiId: string, newName: string) {
    await this.roles.requirePermission(serverId, userId, Permission.MANAGE_EMOJIS)

    const emoji = await this.prisma.customEmoji.findFirst({
      where: { id: emojiId, serverId }
    })
    if (!emoji) throw new NotFoundException('Emoji not found')

    const sanitized = newName.replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase()
    if (!sanitized || sanitized.length < 2 || sanitized.length > 32) {
      throw new BadRequestException('Emoji name must be 2-32 alphanumeric/underscore characters')
    }

    const conflict = await this.prisma.customEmoji.findFirst({
      where: { serverId, name: sanitized, NOT: { id: emojiId } }
    })
    if (conflict) throw new BadRequestException(`Emoji :${sanitized}: already exists`)

    const updated = await this.prisma.customEmoji.update({
      where: { id: emojiId },
      data: { name: sanitized }
    })

    await this.auditLog.log(serverId, userId, 'emoji.update', 'emoji', emojiId, `Renamed :${emoji.name}: to :${sanitized}:`)
    return updated
  }

  async deleteEmoji(serverId: string, userId: string, emojiId: string) {
    await this.roles.requirePermission(serverId, userId, Permission.MANAGE_EMOJIS)

    const emoji = await this.prisma.customEmoji.findFirst({
      where: { id: emojiId, serverId }
    })
    if (!emoji) throw new NotFoundException('Emoji not found')

    this.uploads.deleteFile(emoji.imageUrl)
    await this.prisma.customEmoji.delete({ where: { id: emojiId } })

    await this.auditLog.log(serverId, userId, 'emoji.delete', 'emoji', emojiId, `:${emoji.name}:`)
    this.events.emit('server:updated', { serverId })
  }
}
