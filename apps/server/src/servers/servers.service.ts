import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { ChannelType, Prisma } from '@prisma/client'
import { Permission } from '@chat/shared'
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
  status: true,
  customStatus: true
} as const

const memberInclude = {
  user: { select: memberUserSelect },
  role: true
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
    return server
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

  async updateMemberRole(serverId: string, actorId: string, targetUserId: string, roleId: string) {
    await this.roles.requirePermission(serverId, actorId, Permission.MANAGE_ROLES)
    if (targetUserId === actorId) {
      throw new ForbiddenException('You cannot change your own role')
    }
    const role = await this.prisma.role.findFirst({ where: { id: roleId, serverId } })
    if (!role) throw new NotFoundException('Role not found')

    const target = await this.prisma.serverMember.findUnique({
      where: { userId_serverId: { userId: targetUserId, serverId } }
    })
    if (!target) throw new NotFoundException('Member not found')

    const result = await this.prisma.serverMember.update({
      where: { userId_serverId: { userId: targetUserId, serverId } },
      data: { roleId },
      include: { ...memberInclude }
    })
    await this.auditLog.log(serverId, actorId, 'member.role.update', 'user', targetUserId, `Role changed to ${role.name}`)
    this.events.emit('member:updated', { serverId, userId: targetUserId, roleId })
    return result
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
    const defaultRoleId = await this.roles.getDefaultRoleId(serverId)
    const member = await this.prisma.serverMember.create({
      data: {
        userId,
        serverId,
        roleId: defaultRoleId
      },
      include: memberInclude
    })
    this.events.emit('member:joined', { serverId, member })
    return member
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
    return this.prisma.serverMember.findMany({
      where: { serverId },
      include: memberInclude,
      orderBy: { joinedAt: 'asc' }
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
