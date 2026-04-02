import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { Permission, hasPermission } from '@chat/shared'
import * as bcrypt from 'bcryptjs'
import { randomUUID } from 'node:crypto'
import { hashBotToken } from '../auth/bot-token.strategy'
import { EventBusService } from '../events/event-bus.service'
import { PrismaService } from '../prisma/prisma.service'
import { RedisService } from '../redis/redis.service'
import { RolesService } from '../roles/roles.service'

@Injectable()
export class BotsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventBusService,
    private readonly roles: RolesService,
    private readonly redis: RedisService
  ) {}

  private async invalidateBotTokenCache(tokenHash: string): Promise<void> {
    try {
      if (this.redis.client.status === 'ready') {
        await this.redis.client.del(`bot:token:${tokenHash}`)
      }
    } catch { /* best-effort */ }
  }

  async createBot(ownerId: string, username: string, displayName: string, description?: string, isPublic = false) {
    const trimmedUsername = username.trim().toLowerCase()
    if (!/^[a-z0-9_-]{2,32}$/.test(trimmedUsername)) {
      throw new BadRequestException('Bot username must be 2-32 characters, lowercase alphanumeric, hyphens, or underscores')
    }

    const existing = await this.prisma.user.findUnique({ where: { username: trimmedUsername } })
    if (existing) {
      throw new ConflictException('Username already taken')
    }

    const botUserId = randomUUID()
    const rawToken = `bot_${randomUUID().replace(/-/g, '')}`
    const tokenHash = hashBotToken(rawToken)
    const syntheticEmail = `${botUserId}@bot.internal`
    const randomPassword = await bcrypt.hash(randomUUID(), 4)

    const botApp = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          id: botUserId,
          username: trimmedUsername,
          email: syntheticEmail,
          passwordHash: randomPassword,
          displayName: displayName.trim(),
          bio: description?.trim() || null,
          isBot: true
        }
      })

      return tx.botApplication.create({
        data: {
          name: displayName.trim(),
          description: description?.trim() || null,
          public: isPublic,
          userId: user.id,
          ownerId,
          tokenHash
        },
        include: {
          user: { select: { id: true, username: true, displayName: true, avatarUrl: true } }
        }
      })
    })

    return { ...this.mapToWire(botApp), token: rawToken }
  }

  async listOwnBots(ownerId: string) {
    const bots = await this.prisma.botApplication.findMany({
      where: { ownerId },
      include: {
        user: { select: { id: true, username: true, displayName: true, avatarUrl: true } }
      },
      orderBy: { createdAt: 'asc' }
    })
    return bots.map(this.mapToWire)
  }

  async getBot(botId: string, ownerId: string) {
    const bot = await this.requireOwnership(botId, ownerId)
    return this.mapToWire(bot)
  }

  async updateBot(botId: string, ownerId: string, data: { displayName?: string; description?: string; public?: boolean }) {
    const bot = await this.requireOwnership(botId, ownerId)

    const updates: Record<string, any> = {}
    if (data.displayName !== undefined) updates.name = data.displayName.trim()
    if (data.description !== undefined) updates.description = data.description.trim() || null
    if (data.public !== undefined) updates.public = data.public

    const updated = await this.prisma.botApplication.update({
      where: { id: bot.id },
      data: updates,
      include: {
        user: { select: { id: true, username: true, displayName: true, avatarUrl: true } }
      }
    })

    const userUpdates: Record<string, any> = {}
    if (data.displayName !== undefined) userUpdates.displayName = data.displayName.trim()
    if (data.description !== undefined) userUpdates.bio = data.description.trim() || null
    if (Object.keys(userUpdates).length > 0) {
      await this.prisma.user.update({
        where: { id: bot.userId },
        data: userUpdates
      })
      this.events.emit('user:profile', {
        userId: bot.userId,
        ...userUpdates
      })
    }

    return this.mapToWire(updated)
  }

  async deleteBot(botId: string, ownerId: string) {
    const bot = await this.requireOwnership(botId, ownerId)
    const tokenHash = (await this.prisma.botApplication.findUnique({
      where: { id: bot.id },
      select: { tokenHash: true }
    }))?.tokenHash

    await this.prisma.$transaction([
      this.prisma.botApplication.delete({ where: { id: bot.id } }),
      this.prisma.user.delete({ where: { id: bot.userId } })
    ])

    if (tokenHash) {
      await this.invalidateBotTokenCache(tokenHash)
    }
  }

  async regenerateToken(botId: string, ownerId: string) {
    const bot = await this.requireOwnership(botId, ownerId)
    const oldTokenHash = (await this.prisma.botApplication.findUnique({
      where: { id: bot.id },
      select: { tokenHash: true }
    }))?.tokenHash

    const rawToken = `bot_${randomUUID().replace(/-/g, '')}`
    const tokenHash = hashBotToken(rawToken)

    await this.prisma.botApplication.update({
      where: { id: bot.id },
      data: { tokenHash }
    })

    if (oldTokenHash) {
      await this.invalidateBotTokenCache(oldTokenHash)
    }

    return { token: rawToken }
  }

  async addBotToServer(serverId: string, actorId: string, botUsername: string) {
    await this.roles.requirePermission(serverId, actorId, Permission.MANAGE_SERVER)

    const botUser = await this.prisma.user.findUnique({
      where: { username: botUsername.trim().toLowerCase() },
      select: { id: true, isBot: true }
    })
    if (!botUser || !botUser.isBot) {
      throw new NotFoundException('Bot not found')
    }

    const botApp = await this.prisma.botApplication.findUnique({
      where: { userId: botUser.id },
      select: { public: true, ownerId: true }
    })
    if (!botApp) throw new NotFoundException('Bot not found')
    if (!botApp.public && botApp.ownerId !== actorId) {
      throw new ForbiddenException('This bot is private')
    }

    const existing = await this.prisma.serverMember.findUnique({
      where: { userId_serverId: { userId: botUser.id, serverId } }
    })
    if (existing) {
      throw new ConflictException('Bot is already a member of this server')
    }

    const server = await this.prisma.server.findUnique({
      where: { id: serverId },
      select: { onboardingEnabled: true }
    })

    const member = await this.prisma.serverMember.create({
      data: {
        userId: botUser.id,
        serverId,
        onboardingCompleted: true
      },
      include: {
        user: {
          select: { id: true, username: true, displayName: true, avatarUrl: true, bio: true, status: true, isBot: true }
        }
      }
    })

    const defaultRoleId = await this.roles.getDefaultRoleId(serverId)
    await this.prisma.serverMemberRole.create({
      data: { userId: botUser.id, serverId, roleId: defaultRoleId }
    })

    this.events.emit('member:joined', { serverId, member })
    return member
  }

  async removeBotFromServer(serverId: string, actorId: string, botUserId: string) {
    await this.roles.requirePermission(serverId, actorId, Permission.MANAGE_SERVER)

    const botUser = await this.prisma.user.findUnique({
      where: { id: botUserId },
      select: { isBot: true }
    })
    if (!botUser?.isBot) {
      throw new NotFoundException('Bot not found')
    }

    await this.prisma.serverMember.delete({
      where: { userId_serverId: { userId: botUserId, serverId } }
    }).catch(() => {
      throw new NotFoundException('Bot is not a member of this server')
    })

    this.events.emit('member:removed', { serverId, userId: botUserId })
  }

  async listServerBots(serverId: string, requesterId?: string) {
    if (requesterId) {
      const membership = await this.prisma.serverMember.findUnique({
        where: { userId_serverId: { userId: requesterId, serverId } }
      })
      if (!membership) throw new ForbiddenException('Not a member of this server')
    }
    const members = await this.prisma.serverMember.findMany({
      where: { serverId, user: { isBot: true } },
      include: {
        user: {
          select: { id: true, username: true, displayName: true, avatarUrl: true, isBot: true }
        },
        roles: { include: { role: true } }
      }
    })
    return members.map((m) => ({
      userId: m.userId,
      user: m.user,
      joinedAt: m.joinedAt,
      roles: m.roles.map((r) => ({
        id: r.role.id,
        name: r.role.name,
        color: r.role.color
      }))
    }))
  }

  async syncCommands(botAppId: string, commands: { name: string; description: string; parameters?: any[]; requiredPermission?: string }[]) {
    const botApp = await this.prisma.botApplication.findUnique({
      where: { id: botAppId },
      select: { id: true, userId: true }
    })
    if (!botApp) throw new NotFoundException('Bot application not found')

    await this.prisma.$transaction(async (tx) => {
      await tx.botCommand.deleteMany({ where: { botAppId } })
      if (commands.length > 0) {
        await tx.botCommand.createMany({
          data: commands.map((cmd) => ({
            botAppId,
            name: cmd.name.toLowerCase().trim(),
            description: cmd.description.trim(),
            parameters: cmd.parameters ?? [],
            requiredPermission: cmd.requiredPermission ?? null
          }))
        })
      }
    })

    const servers = await this.prisma.serverMember.findMany({
      where: { userId: botApp.userId },
      select: { serverId: true }
    })
    for (const { serverId } of servers) {
      this.events.emit('bot:commands-updated', { serverId, botAppId })
    }
  }

  async getServerBotCommands(serverId: string, channelId?: string, requesterId?: string) {
    if (requesterId) {
      const membership = await this.prisma.serverMember.findUnique({
        where: { userId_serverId: { userId: requesterId, serverId } }
      })
      if (!membership) throw new ForbiddenException('Not a member of this server')
    }
    const botMembers = await this.prisma.serverMember.findMany({
      where: { serverId, user: { isBot: true } },
      select: { userId: true }
    })
    let botUserIds = botMembers.map((m) => m.userId)
    if (botUserIds.length === 0) return []

    if (channelId) {
      const channel = await this.prisma.channel.findUnique({
        where: { id: channelId },
        select: { serverId: true }
      })
      if (!channel || channel.serverId !== serverId) return []

      const allowed: string[] = []
      for (const uid of botUserIds) {
        try {
          const perms = await this.roles.getChannelPermissions(serverId, channelId, uid)
          if (hasPermission(perms, Permission.VIEW_CHANNEL) && hasPermission(perms, Permission.SEND_MESSAGES)) {
            allowed.push(uid)
          }
        } catch { /* no membership / error → exclude */ }
      }
      botUserIds = allowed
      if (botUserIds.length === 0) return []
    }

    const botApps = await this.prisma.botApplication.findMany({
      where: { userId: { in: botUserIds } },
      include: {
        commands: true,
        user: { select: { id: true, username: true, displayName: true, avatarUrl: true } }
      }
    })

    return botApps.flatMap((app) =>
      app.commands.map((cmd) => ({
        id: cmd.id,
        botAppId: app.id,
        name: cmd.name,
        description: cmd.description,
        parameters: cmd.parameters,
        requiredPermission: cmd.requiredPermission,
        createdAt: cmd.createdAt,
        bot: {
          id: app.id,
          name: app.name,
          user: app.user
        }
      }))
    )
  }

  async getBotUserCommands(botUserId: string, requesterId?: string) {
    if (requesterId) {
      const sharedConversation = await this.prisma.directConversation.findFirst({
        where: {
          members: { every: { userId: { in: [requesterId, botUserId] } } }
        },
        select: { id: true }
      })
      const shareServer = await this.prisma.serverMember.findFirst({
        where: {
          userId: requesterId,
          server: { members: { some: { userId: botUserId } } }
        },
        select: { serverId: true }
      })
      if (!sharedConversation && !shareServer) {
        throw new ForbiddenException('No shared context with this bot')
      }
    }
    const botApp = await this.prisma.botApplication.findUnique({
      where: { userId: botUserId },
      include: {
        commands: true,
        user: { select: { id: true, username: true, displayName: true, avatarUrl: true } }
      }
    })
    if (!botApp) return []

    return botApp.commands.map((cmd) => ({
      id: cmd.id,
      botAppId: botApp.id,
      name: cmd.name,
      description: cmd.description,
      parameters: cmd.parameters,
      requiredPermission: cmd.requiredPermission,
      createdAt: cmd.createdAt,
      bot: {
        id: botApp.id,
        name: botApp.name,
        user: botApp.user
      }
    }))
  }

  async searchBots(query: string, requesterId?: string) {
    const q = query.trim().toLowerCase().slice(0, 64)
    if (!q || q.length < 2) return []

    const users = await this.prisma.user.findMany({
      where: {
        isBot: true,
        username: { contains: q, mode: 'insensitive' },
        botApplication: {
          OR: [
            { public: true },
            ...(requesterId ? [{ ownerId: requesterId }] : [])
          ]
        }
      },
      select: { id: true, username: true, displayName: true, avatarUrl: true },
      take: 20
    })
    return users
  }

  private async requireOwnership(botId: string, ownerId: string) {
    const bot = await this.prisma.botApplication.findUnique({
      where: { id: botId },
      include: {
        user: { select: { id: true, username: true, displayName: true, avatarUrl: true } }
      }
    })
    if (!bot) throw new NotFoundException('Bot not found')
    if (bot.ownerId !== ownerId) throw new ForbiddenException('You do not own this bot')
    return bot
  }

  private mapToWire(bot: any) {
    return {
      id: bot.id,
      name: bot.name,
      description: bot.description,
      public: bot.public,
      userId: bot.userId,
      ownerId: bot.ownerId,
      createdAt: bot.createdAt instanceof Date ? bot.createdAt.toISOString() : bot.createdAt,
      updatedAt: bot.updatedAt instanceof Date ? bot.updatedAt.toISOString() : bot.updatedAt,
      user: bot.user
    }
  }
}
