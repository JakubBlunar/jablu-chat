import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { ChannelType, Prisma, ServerRole } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { messageInclude, mapMessageToWire, type MessageWithRelations } from './message-wire'

@Injectable()
export class MessagesService {
  constructor(private readonly prisma: PrismaService) {}

  mapToWire(m: MessageWithRelations) {
    return mapMessageToWire(m)
  }

  private async requireTextChannelMember(channelId: string, userId: string) {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId }
    })
    if (!channel) {
      throw new NotFoundException('Channel not found')
    }
    if (channel.type !== ChannelType.text) {
      throw new ForbiddenException('Messages are only available in text channels')
    }
    const membership = await this.prisma.serverMember.findUnique({
      where: {
        userId_serverId: { userId, serverId: channel.serverId }
      }
    })
    if (!membership) {
      throw new ForbiddenException('You are not a member of this server')
    }
    return channel
  }

  private async requireAdminOrOwnerForServer(serverId: string, userId: string) {
    const server = await this.prisma.server.findUnique({
      where: { id: serverId }
    })
    if (!server) {
      throw new NotFoundException('Server not found')
    }
    if (server.ownerId === userId) {
      return server
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
    return server
  }

  async getMessages(channelId: string, userId: string, cursor?: string, limit = 50) {
    await this.requireTextChannelMember(channelId, userId)
    const take = Math.min(Math.max(1, limit), 100)

    const baseWhere: Prisma.MessageWhereInput = {
      channelId,
      deleted: false
    }

    let where: Prisma.MessageWhereInput = baseWhere
    if (cursor) {
      const cursorMsg = await this.prisma.message.findFirst({
        where: { id: cursor, channelId, deleted: false }
      })
      if (!cursorMsg) {
        throw new BadRequestException('Invalid cursor')
      }
      where = {
        AND: [
          baseWhere,
          {
            OR: [
              { createdAt: { lt: cursorMsg.createdAt } },
              {
                AND: [{ createdAt: cursorMsg.createdAt }, { id: { lt: cursorMsg.id } }]
              }
            ]
          }
        ]
      }
    }

    const rows = await this.prisma.message.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      include: messageInclude
    })

    const hasMore = rows.length > take
    const page = hasMore ? rows.slice(0, take) : rows
    return {
      messages: page.map((m) => this.mapToWire(m)),
      hasMore
    }
  }

  async getMessagesAround(channelId: string, userId: string, messageId: string, limit = 50) {
    await this.requireTextChannelMember(channelId, userId)
    const half = Math.floor(Math.min(Math.max(1, limit), 100) / 2)

    const anchor = await this.prisma.message.findFirst({
      where: { id: messageId, channelId, deleted: false }
    })
    if (!anchor) {
      return this.getMessages(channelId, userId, undefined, limit)
    }

    const [before, after] = await Promise.all([
      this.prisma.message.findMany({
        where: {
          channelId,
          deleted: false,
          OR: [
            { createdAt: { lt: anchor.createdAt } },
            { AND: [{ createdAt: anchor.createdAt }, { id: { lt: anchor.id } }] }
          ]
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: half,
        include: messageInclude
      }),
      this.prisma.message.findMany({
        where: {
          channelId,
          deleted: false,
          OR: [
            { createdAt: { gt: anchor.createdAt } },
            { AND: [{ createdAt: anchor.createdAt }, { id: { gt: anchor.id } }] }
          ]
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: half,
        include: messageInclude
      })
    ])

    const anchorRow = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: messageInclude
    })

    const allDesc = [...after.reverse(), ...(anchorRow ? [anchorRow] : []), ...before]

    return {
      messages: allDesc.map((m) => this.mapToWire(m)),
      hasMore: before.length >= half,
      hasNewer: after.length >= half
    }
  }

  async getMessagesAfter(channelId: string, userId: string, afterId: string, limit = 50) {
    await this.requireTextChannelMember(channelId, userId)
    const take = Math.min(Math.max(1, limit), 100)

    const afterMsg = await this.prisma.message.findFirst({
      where: { id: afterId, channelId, deleted: false }
    })
    if (!afterMsg) {
      throw new BadRequestException('Invalid after cursor')
    }

    const rows = await this.prisma.message.findMany({
      where: {
        channelId,
        deleted: false,
        OR: [
          { createdAt: { gt: afterMsg.createdAt } },
          {
            AND: [{ createdAt: afterMsg.createdAt }, { id: { gt: afterMsg.id } }]
          }
        ]
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: take + 1,
      include: messageInclude
    })

    const hasNewer = rows.length > take
    const page = hasNewer ? rows.slice(0, take) : rows
    // Return in desc order for consistency with other endpoints
    return {
      messages: page.reverse().map((m) => this.mapToWire(m)),
      hasMore: false,
      hasNewer
    }
  }

  async createMessage(
    channelId: string,
    userId: string,
    content?: string,
    replyToId?: string,
    attachmentIds?: string[]
  ) {
    await this.requireTextChannelMember(channelId, userId)

    const trimmed = content?.trim()
    const hasAttachments = !!attachmentIds?.length
    if (!trimmed && !hasAttachments) {
      throw new BadRequestException('Message must have content or at least one attachment')
    }

    if (replyToId) {
      const parent = await this.prisma.message.findFirst({
        where: { id: replyToId, channelId }
      })
      if (!parent) {
        throw new BadRequestException('Invalid replyToId')
      }
    }

    const created = await this.prisma.$transaction(async (tx) => {
      if (hasAttachments) {
        const found = await tx.attachment.findMany({
          where: {
            id: { in: attachmentIds },
            uploaderId: userId,
            messageId: null
          },
          select: { id: true }
        })
        if (found.length !== attachmentIds!.length) {
          throw new BadRequestException('One or more attachments were not found or do not belong to you')
        }
      }

      return tx.message.create({
        data: {
          channelId,
          authorId: userId,
          content: trimmed ?? null,
          replyToId: replyToId ?? undefined,
          attachments: hasAttachments ? { connect: attachmentIds!.map((id) => ({ id })) } : undefined
        },
        include: { ...messageInclude, channel: { select: { serverId: true } } }
      })
    })

    const { channel, ...rest } = created
    return { ...this.mapToWire(rest as any), serverId: channel!.serverId }
  }

  async editMessageInChannel(messageId: string, channelId: string, userId: string, content: string) {
    const exists = await this.prisma.message.findFirst({
      where: { id: messageId, channelId }
    })
    if (!exists) {
      throw new NotFoundException('Message not found')
    }
    return this.editMessage(messageId, userId, content)
  }

  async deleteMessageInChannel(messageId: string, channelId: string, userId: string) {
    const exists = await this.prisma.message.findFirst({
      where: { id: messageId, channelId }
    })
    if (!exists) {
      throw new NotFoundException('Message not found')
    }
    return this.deleteMessage(messageId, userId)
  }

  async editMessage(messageId: string, userId: string, content: string) {
    const message = await this.prisma.message.findFirst({
      where: { id: messageId, channelId: { not: null } },
      include: { channel: true }
    })
    if (!message || !message.channelId) {
      throw new NotFoundException('Message not found')
    }
    await this.requireTextChannelMember(message.channelId, userId)
    if (message.deleted) {
      throw new ForbiddenException('Cannot edit a deleted message')
    }
    if (message.authorId !== userId) {
      throw new ForbiddenException('You can only edit your own messages')
    }

    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: {
        content: content.trim(),
        editedAt: new Date()
      },
      include: messageInclude
    })

    return this.mapToWire(updated)
  }

  async deleteMessage(messageId: string, userId: string) {
    const message = await this.prisma.message.findFirst({
      where: { id: messageId, channelId: { not: null } },
      include: { channel: true }
    })
    if (!message || !message.channelId || !message.channel) {
      throw new NotFoundException('Message not found')
    }
    await this.requireTextChannelMember(message.channelId, userId)

    if (message.deleted) {
      return { id: messageId, deleted: true }
    }

    const isAuthor = message.authorId === userId
    if (!isAuthor) {
      await this.requireAdminOrOwnerForServer(message.channel.serverId, userId)
    }

    await this.prisma.message.update({
      where: { id: messageId },
      data: { deleted: true, content: null }
    })

    return { id: messageId, deleted: true }
  }

  async pinMessage(messageId: string, userId: string, channelId: string) {
    const channel = await this.requireTextChannelMember(channelId, userId)
    await this.requireAdminOrOwnerForServer(channel.serverId, userId)

    const message = await this.prisma.message.findFirst({
      where: { id: messageId, channelId }
    })
    if (!message) {
      throw new NotFoundException('Message not found')
    }
    if (message.deleted) {
      throw new BadRequestException('Cannot pin a deleted message')
    }

    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: { pinned: true },
      include: messageInclude
    })

    return this.mapToWire(updated)
  }

  async unpinMessage(messageId: string, userId: string, channelId: string) {
    const channel = await this.requireTextChannelMember(channelId, userId)
    await this.requireAdminOrOwnerForServer(channel.serverId, userId)

    const message = await this.prisma.message.findFirst({
      where: { id: messageId, channelId }
    })
    if (!message) {
      throw new NotFoundException('Message not found')
    }

    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: { pinned: false },
      include: messageInclude
    })

    return this.mapToWire(updated)
  }

  async getMessageChannelId(messageId: string): Promise<string | null> {
    const row = await this.prisma.message.findFirst({
      where: { id: messageId },
      select: { channelId: true }
    })
    return row?.channelId ?? null
  }

  async getMessageContext(
    messageId: string
  ): Promise<{ channelId: string | null; directConversationId: string | null }> {
    const row = await this.prisma.message.findFirst({
      where: { id: messageId },
      select: { channelId: true, directConversationId: true }
    })
    return {
      channelId: row?.channelId ?? null,
      directConversationId: row?.directConversationId ?? null
    }
  }

  async toggleReaction(messageId: string, userId: string, emoji: string, isCustom = false) {
    const message = await this.prisma.message.findFirst({
      where: { id: messageId, deleted: false }
    })
    if (!message) throw new NotFoundException('Message not found')

    if (message.channelId) {
      await this.requireTextChannelMember(message.channelId, userId)
    } else if (message.directConversationId) {
      const member = await this.prisma.directConversationMember.findUnique({
        where: {
          conversationId_userId: {
            conversationId: message.directConversationId,
            userId
          }
        }
      })
      if (!member) throw new ForbiddenException('Not a member of this conversation')
    }

    const existing = await this.prisma.reaction.findUnique({
      where: { messageId_userId_emoji: { messageId, userId, emoji } }
    })

    if (existing) {
      await this.prisma.reaction.delete({ where: { id: existing.id } })
      return {
        action: 'removed' as const,
        messageId,
        emoji,
        userId,
        isCustom,
        channelId: message.channelId,
        directConversationId: message.directConversationId
      }
    }

    await this.prisma.reaction.create({
      data: { messageId, userId, emoji, isCustom }
    })
    return {
      action: 'added' as const,
      messageId,
      emoji,
      userId,
      isCustom,
      channelId: message.channelId,
      directConversationId: message.directConversationId
    }
  }

  async getPinnedMessages(channelId: string, userId: string) {
    await this.requireTextChannelMember(channelId, userId)

    const rows = await this.prisma.message.findMany({
      where: { channelId, pinned: true, deleted: false },
      orderBy: { createdAt: 'desc' },
      include: messageInclude
    })

    return rows.map((m) => this.mapToWire(m))
  }

  /** For gateway: ensure user can access channel (any channel type for room join). */
  async assertUserCanAccessChannel(channelId: string, userId: string) {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId }
    })
    if (!channel) {
      throw new NotFoundException('Channel not found')
    }
    const membership = await this.prisma.serverMember.findUnique({
      where: {
        userId_serverId: { userId, serverId: channel.serverId }
      }
    })
    if (!membership) {
      throw new ForbiddenException('You are not a member of this server')
    }
    return channel
  }
}
