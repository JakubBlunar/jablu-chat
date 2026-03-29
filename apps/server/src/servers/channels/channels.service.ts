import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common'
import { ChannelType, Prisma } from '@prisma/client'
import { Permission } from '@chat/shared'
import { EventBusService } from '../../events/event-bus.service'
import { PrismaService } from '../../prisma/prisma.service'
import { RolesService } from '../../roles/roles.service'
import { UploadsService } from '../../uploads/uploads.service'
import { AuditLogService } from '../audit-log.service'

@Injectable()
export class ChannelsService {
  constructor(
    private readonly events: EventBusService,
    private readonly prisma: PrismaService,
    private readonly uploads: UploadsService,
    private readonly auditLog: AuditLogService,
    private readonly roles: RolesService
  ) {}

  private async requireMembership(serverId: string, userId: string) {
    return this.roles.requireMembership(serverId, userId)
  }

  async createChannel(serverId: string, userId: string, name: string, type: ChannelType, categoryId?: string | null) {
    await this.roles.requirePermission(serverId, userId, Permission.MANAGE_CHANNELS)
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
          position,
          categoryId: categoryId || null
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

  async updateChannel(serverId: string, channelId: string, userId: string, data: { name?: string; position?: number; categoryId?: string | null; isArchived?: boolean }) {
    await this.roles.requirePermission(serverId, userId, Permission.MANAGE_CHANNELS)
    const channel = await this.prisma.channel.findFirst({
      where: { id: channelId, serverId }
    })
    if (!channel) {
      throw new NotFoundException('Channel not found')
    }
    if (data.name === undefined && data.position === undefined && data.categoryId === undefined && data.isArchived === undefined) {
      return channel
    }
    try {
      const updated = await this.prisma.channel.update({
        where: { id: channelId },
        data
      })
      const detail = data.isArchived !== undefined
        ? (data.isArchived ? `Archived #${channel.name}` : `Unarchived #${channel.name}`)
        : data.name ? `Renamed to #${data.name}` : 'Position changed'
      await this.auditLog.log(serverId, userId, 'channel.update', 'channel', channelId, detail)
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
    await this.roles.requirePermission(serverId, userId, Permission.MANAGE_CHANNELS)
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
    await this.roles.requirePermission(serverId, userId, Permission.MANAGE_CHANNELS)

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
