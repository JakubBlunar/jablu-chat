import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from '@nestjs/common'
import { ChannelType, Prisma } from '@prisma/client'
import { Permission } from '@chat/shared'
import { PrismaService } from '../prisma/prisma.service'
import { RolesService } from '../roles/roles.service'

@Injectable()
export class ForumTagsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly roles: RolesService
  ) {}

  private async requireForumChannel(channelId: string) {
    const channel = await this.prisma.channel.findUnique({ where: { id: channelId } })
    if (!channel) throw new NotFoundException('Channel not found')
    if (channel.type !== ChannelType.forum) throw new BadRequestException('Channel is not a forum')
    return channel
  }

  async listTags(channelId: string) {
    const channel = await this.prisma.channel.findUnique({ where: { id: channelId } })
    if (!channel) throw new NotFoundException('Channel not found')
    if (channel.type !== ChannelType.forum) return []

    return this.prisma.forumTag.findMany({
      where: { channelId },
      orderBy: { position: 'asc' }
    })
  }

  async createTag(channelId: string, userId: string, name: string, color?: string) {
    const channel = await this.requireForumChannel(channelId)
    await this.roles.requirePermission(channel.serverId, userId, Permission.MANAGE_CHANNELS)

    const maxPos = await this.prisma.forumTag.aggregate({
      where: { channelId },
      _max: { position: true }
    })

    try {
      return await this.prisma.forumTag.create({
        data: {
          channelId,
          name: name.trim(),
          color: color || null,
          position: (maxPos._max.position ?? -1) + 1
        }
      })
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('A tag with this name already exists in this channel')
      }
      throw e
    }
  }

  async updateTag(channelId: string, tagId: string, userId: string, name?: string, color?: string | null) {
    const channel = await this.requireForumChannel(channelId)
    await this.roles.requirePermission(channel.serverId, userId, Permission.MANAGE_CHANNELS)

    const tag = await this.prisma.forumTag.findFirst({ where: { id: tagId, channelId } })
    if (!tag) throw new NotFoundException('Tag not found')

    const data: Prisma.ForumTagUpdateInput = {}
    if (name !== undefined) data.name = name.trim()
    if (color !== undefined) data.color = color

    try {
      return await this.prisma.forumTag.update({ where: { id: tagId }, data })
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('A tag with this name already exists in this channel')
      }
      throw e
    }
  }

  async deleteTag(channelId: string, tagId: string, userId: string) {
    const channel = await this.requireForumChannel(channelId)
    await this.roles.requirePermission(channel.serverId, userId, Permission.MANAGE_CHANNELS)

    const tag = await this.prisma.forumTag.findFirst({ where: { id: tagId, channelId } })
    if (!tag) throw new NotFoundException('Tag not found')

    await this.prisma.forumTag.delete({ where: { id: tagId } })
    return { id: tagId, deleted: true }
  }
}
