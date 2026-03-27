import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common'
import { ChannelType, Prisma, ServerRole } from '@prisma/client'
import { EventBusService } from '../../events/event-bus.service'
import { PrismaService } from '../../prisma/prisma.service'
import { UploadsService } from '../../uploads/uploads.service'
import { AuditLogService } from '../audit-log.service'

@Injectable()
export class ChannelsService {
  constructor(
    private readonly events: EventBusService,
    private readonly prisma: PrismaService,
    private readonly uploads: UploadsService,
    private readonly auditLog: AuditLogService
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

  private async requireAdminOrOwner(serverId: string, userId: string) {
    const server = await this.getServerOrThrow(serverId)
    if (server.ownerId === userId) {
      return
    }
    const membership = await this.prisma.serverMember.findUnique({
      where: {
        userId_serverId: { userId, serverId }
      }
    })
    if (!membership) {
      throw new ForbiddenException('You are not a member of this server')
    }
    if (membership.role !== ServerRole.admin && membership.role !== ServerRole.owner) {
      throw new ForbiddenException('Insufficient permissions')
    }
  }

  async createChannel(serverId: string, userId: string, name: string, type: ChannelType) {
    await this.requireAdminOrOwner(serverId, userId)
    const maxPos = await this.prisma.channel.aggregate({
      where: { serverId },
      _max: { position: true }
    })
    const position = (maxPos._max.position ?? -1) + 1
    try {
      const channel = await this.prisma.channel.create({
        data: {
          serverId,
          name,
          type,
          position
        }
      })
      await this.auditLog.log(serverId, userId, 'channel.create', 'channel', channel.id, `#${name} (${type})`)
      this.events.emit('channel:created', { serverId, channel })
      return channel
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('A channel with this name already exists on this server')
      }
      throw e
    }
  }

  async getChannels(serverId: string, userId: string) {
    await this.requireMembership(serverId, userId)
    const channels = await this.prisma.channel.findMany({
      where: { serverId },
      orderBy: { position: 'asc' },
      include: {
        _count: {
          select: { messages: { where: { pinned: true, deleted: false } } }
        }
      }
    })
    return channels.map(({ _count, ...ch }) => ({
      ...ch,
      pinnedCount: _count.messages
    }))
  }

  async updateChannel(serverId: string, channelId: string, userId: string, data: { name?: string; position?: number }) {
    await this.requireAdminOrOwner(serverId, userId)
    const channel = await this.prisma.channel.findFirst({
      where: { id: channelId, serverId }
    })
    if (!channel) {
      throw new NotFoundException('Channel not found')
    }
    if (data.name === undefined && data.position === undefined) {
      return channel
    }
    try {
      const updated = await this.prisma.channel.update({
        where: { id: channelId },
        data
      })
      await this.auditLog.log(
        serverId,
        userId,
        'channel.update',
        'channel',
        channelId,
        data.name ? `Renamed to #${data.name}` : 'Position changed'
      )
      this.events.emit('channel:updated', { serverId, channel: updated })
      return updated
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('A channel with this name already exists on this server')
      }
      throw e
    }
  }

  async deleteChannel(serverId: string, channelId: string, userId: string) {
    await this.requireAdminOrOwner(serverId, userId)
    const channel = await this.prisma.channel.findFirst({
      where: { id: channelId, serverId }
    })
    if (!channel) {
      throw new NotFoundException('Channel not found')
    }

    const attachments = await this.prisma.attachment.findMany({
      where: { message: { channelId } },
      select: { url: true, thumbnailUrl: true }
    })
    for (const a of attachments) {
      this.uploads.deleteFile(a.url)
      if (a.thumbnailUrl) this.uploads.deleteFile(a.thumbnailUrl)
    }

    await this.prisma.channel.delete({ where: { id: channelId } })
    await this.auditLog.log(serverId, userId, 'channel.delete', 'channel', channelId, `#${channel.name}`)
    this.events.emit('channel:deleted', { serverId, channelId })
  }

  async reorderChannels(serverId: string, userId: string, channelIds: string[]) {
    await this.requireAdminOrOwner(serverId, userId)

    const channels = await this.prisma.channel.findMany({
      where: { id: { in: channelIds }, serverId },
      select: { id: true }
    })
    if (channels.length !== channelIds.length) {
      throw new BadRequestException('Some channel IDs do not belong to this server')
    }

    await this.prisma.$transaction(
      channelIds.map((id, i) =>
        this.prisma.channel.update({
          where: { id },
          data: { position: i }
        })
      )
    )

    await this.auditLog.log(
      serverId,
      userId,
      'channel.reorder',
      'server',
      serverId,
      `Reordered ${channelIds.length} channels`
    )

    this.events.emit('channel:reorder', { serverId, channelIds })
  }
}
