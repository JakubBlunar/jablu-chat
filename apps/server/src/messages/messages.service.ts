import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { ChannelType, Prisma } from '../prisma-client'
import { Permission } from '@chat/shared'
import { PrismaService } from '../prisma/prisma.service'
import { RolesService } from '../roles/roles.service'
import { XpService } from '../xp/xp.service'
import { messageInclude, mapMessageToWire, type MessageWithRelations } from './message-wire'
import { historyInclude, mapHistory } from './history-wire'
import { EmbedDto } from './dto/embed.dto'
import { findMessageReplay } from './message-replay'

export type MessageSendOperation = Readonly<{
  userId: string
  channel: Readonly<{ id: string; serverId: string; name: string; type: string; isArchived: boolean }>
  senderMentionPermissions: bigint
}>

@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name)
  private readonly sendOperations = new WeakSet<MessageSendOperation>()

  constructor(
    private readonly prisma: PrismaService,
    private readonly roles: RolesService,
    private readonly xp: XpService
  ) {}

  mapToWire(m: MessageWithRelations, requestingUserId?: string) {
    return mapMessageToWire(m, requestingUserId)
  }

  /** Existing REST/WS send checks, loaded once for a single send callback. */
  async withSendAuthorization<T>(channelId: string, userId: string, run: (operation: MessageSendOperation) => Promise<T>): Promise<T> {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId }, select: { id: true, serverId: true, name: true, type: true, isArchived: true }
    })
    if (!channel) throw new NotFoundException('Channel not found')
    if (channel.type !== ChannelType.text && channel.type !== ChannelType.forum) {
      throw new ForbiddenException('Messages are only available in text or forum channels')
    }
    if (channel.isArchived) throw new ForbiddenException('This channel is archived')
    const member = await this.prisma.serverMember.findUnique({
      where: { userId_serverId: { userId, serverId: channel.serverId } },
      select: { mutedUntil: true, roles: { select: { role: { select: { permissions: true } } } } }
    })
    if (!member) throw new ForbiddenException('You are not a member of this server')
    await this.roles.requireChannelPermission(channel.serverId, channelId, userId, Permission.VIEW_CHANNEL | Permission.SEND_MESSAGES)
    if (member.mutedUntil && member.mutedUntil > new Date()) throw new ForbiddenException('You are timed out in this server')
    // Preserve the existing mention policy: assigned role permissions, including
    // an explicitly assigned default role, without granting new mass mentions.
    const senderMentionPermissions = member.roles.reduce((bits, r) => bits | r.role.permissions, 0n)
    const operation = Object.freeze({ userId, channel: Object.freeze(channel), senderMentionPermissions })
    this.sendOperations.add(operation)
    try { return await run(operation) } finally { this.sendOperations.delete(operation) }
  }

  /**
   * Read the source message for a forward and return a snapshot suitable to
   * splat into a Prisma create payload. We deliberately denormalize (author
   * name, content, createdAt, channel name) so the forwarded card renders
   * without joins and survives source edits or channel renames/deletions.
   */
  async buildForwardSnapshot(
    sourceMessageId: string,
    viewerUserId: string
  ): Promise<{
    forwardedFromId: string
    forwardedFromChannelId: string | null
    forwardedFromDmId: string | null
    forwardedFromAuthorId: string | null
    forwardedFromAuthorName: string | null
    forwardedFromChannelName: string | null
    forwardedFromContent: string | null
    forwardedFromCreatedAt: Date
  }> {
    const source = await this.prisma.message.findUnique({
      where: { id: sourceMessageId },
      include: {
        author: { select: { id: true, username: true, displayName: true } },
        channel: { select: { id: true, name: true, serverId: true } },
        directConversation: { select: { id: true, isGroup: true, groupName: true } }
      }
    })
    if (!source || source.deleted) {
      throw new BadRequestException('Source message not found')
    }

    if (source.channel) {
      await this.requireMessageChannelMember(source.channel.id, viewerUserId)
    } else if (source.directConversation) {
      const member = await this.prisma.directConversationMember.findUnique({
        where: {
          conversationId_userId: {
            conversationId: source.directConversation.id,
            userId: viewerUserId
          }
        }
      })
      if (!member) {
        throw new ForbiddenException('You do not have access to the source message')
      }
    } else {
      throw new BadRequestException('Source message is not forwardable')
    }

    const authorName = source.author?.displayName?.trim() || source.author?.username?.trim() || null

    const channelName = source.channel
      ? source.channel.name
      : source.directConversation?.isGroup
        ? (source.directConversation.groupName ?? 'Group')
        : 'Direct message'

    return {
      forwardedFromId: source.id,
      forwardedFromChannelId: source.channel?.id ?? null,
      forwardedFromDmId: source.directConversation?.id ?? null,
      forwardedFromAuthorId: source.author?.id ?? null,
      forwardedFromAuthorName: authorName,
      forwardedFromChannelName: channelName,
      forwardedFromContent: source.content ?? null,
      forwardedFromCreatedAt: source.createdAt
    }
  }

  private async requireMessageChannelMember(channelId: string, userId: string) {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId }
    })
    if (!channel) {
      throw new NotFoundException('Channel not found')
    }
    if (channel.type !== ChannelType.text && channel.type !== ChannelType.forum) {
      throw new ForbiddenException('Messages are only available in text or forum channels')
    }
    const membership = await this.prisma.serverMember.findUnique({
      where: {
        userId_serverId: { userId, serverId: channel.serverId }
      }
    })
    if (!membership) {
      throw new ForbiddenException('You are not a member of this server')
    }
    await this.roles.requireChannelPermission(channel.serverId, channelId, userId, Permission.VIEW_CHANNEL)
    return channel
  }

  async getMessages(channelId: string, userId: string, cursor?: string, limit = 50) {
    await this.requireMessageChannelMember(channelId, userId)
    const take = Math.min(Math.max(1, limit), 100)

    const baseWhere: Prisma.MessageWhereInput = {
      channelId,
      deleted: false,
      threadParentId: null
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
      include: historyInclude(userId)
    })

    const hasMore = rows.length > take
    const page = hasMore ? rows.slice(0, take) : rows
    return {
      messages: await mapHistory(this.prisma, page, userId),
      hasMore
    }
  }

  async getMessagesAround(channelId: string, userId: string, messageId: string, limit = 50) {
    await this.requireMessageChannelMember(channelId, userId)
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
          threadParentId: null,
          OR: [
            { createdAt: { lt: anchor.createdAt } },
            { AND: [{ createdAt: anchor.createdAt }, { id: { lt: anchor.id } }] }
          ]
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: half,
        include: historyInclude(userId)
      }),
      this.prisma.message.findMany({
        where: {
          channelId,
          deleted: false,
          threadParentId: null,
          OR: [
            { createdAt: { gt: anchor.createdAt } },
            { AND: [{ createdAt: anchor.createdAt }, { id: { gt: anchor.id } }] }
          ]
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: half,
        include: historyInclude(userId)
      })
    ])

    const anchorRow = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: historyInclude(userId)
    })

    const allDesc = [...after.reverse(), ...(anchorRow ? [anchorRow] : []), ...before]

    return {
      messages: await mapHistory(this.prisma, allDesc, userId),
      hasMore: before.length >= half,
      hasNewer: after.length >= half
    }
  }

  async getMessagesAfter(channelId: string, userId: string, afterId: string, limit = 50) {
    await this.requireMessageChannelMember(channelId, userId)
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
        threadParentId: null,
        OR: [
          { createdAt: { gt: afterMsg.createdAt } },
          {
            AND: [{ createdAt: afterMsg.createdAt }, { id: { gt: afterMsg.id } }]
          }
        ]
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: take + 1,
      include: historyInclude(userId)
    })

    const hasNewer = rows.length > take
    const page = hasNewer ? rows.slice(0, take) : rows
    // Return in desc order for consistency with other endpoints
    return {
      messages: await mapHistory(this.prisma, page.reverse(), userId),
      hasMore: false,
      hasNewer
    }
  }

  async createMessage(
    channelId: string,
    userId: string,
    content?: string,
    replyToId?: string,
    attachmentIds?: string[],
    threadParentId?: string,
    embeds?: EmbedDto[],
    forwardFromMessageId?: string,
    clientMessageId?: string,
    operation?: MessageSendOperation
  ) {
    let destination: { serverId: string }
    if (operation) {
      if (!this.sendOperations.has(operation) || operation.channel.id !== channelId || operation.userId !== userId) {
        throw new ForbiddenException('Invalid message operation')
      }
      this.sendOperations.delete(operation)
      destination = operation.channel
    } else {
      // Direct callers retain the existing service-level authorization path.
      destination = await this.requireMessageChannelMember(channelId, userId)
    }
    const replay = await findMessageReplay(this.prisma, clientMessageId, userId, { channelId, threadParentId })
    if (replay) {
      return {
        ...this.mapToWire(replay, userId),
        serverId: destination.serverId,
        threadUpdate: undefined,
        replayed: true
      }
    }

    const trimmed = content?.trim()
    const hasAttachments = !!attachmentIds?.length
    const hasEmbeds = !!embeds?.length
    const hasForward = !!forwardFromMessageId
    if (!trimmed && !hasAttachments && !hasEmbeds && !hasForward) {
      throw new BadRequestException('Message must have content, at least one attachment, or embeds')
    }

    if (replyToId) {
      const parent = await this.prisma.message.findFirst({
        where: { id: replyToId, channelId }
      })
      if (!parent) {
        throw new BadRequestException('Invalid replyToId')
      }
    }

    if (threadParentId) {
      const parent = await this.prisma.message.findFirst({
        where: { id: threadParentId, channelId, threadParentId: null }
      })
      if (!parent) {
        throw new BadRequestException('Invalid threadParentId')
      }
    }

    const forwardSnapshot = hasForward ? await this.buildForwardSnapshot(forwardFromMessageId!, userId) : null

    const createWithChannelInclude = {
      ...messageInclude,
      channel: { select: { serverId: true } }
    } satisfies Prisma.MessageInclude
    type MessageCreatedWithChannel = Prisma.MessageGetPayload<{ include: typeof createWithChannelInclude }>

    let created: MessageCreatedWithChannel
    try {
      created = await this.prisma.$transaction(async (tx) => {
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
            id: clientMessageId,
            channelId,
            authorId: userId,
            content: trimmed ?? null,
            replyToId: replyToId ?? undefined,
            threadParentId: threadParentId ?? undefined,
            attachments: hasAttachments ? { connect: attachmentIds!.map((id) => ({ id })) } : undefined,
            embeds: hasEmbeds ? (embeds as unknown as Prisma.InputJsonValue) : undefined,
            ...(forwardSnapshot ?? {})
          },
          include: createWithChannelInclude
        })
      })
    } catch (error) {
      if (
        clientMessageId &&
        ((error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') ||
          error instanceof BadRequestException)
      ) {
        const concurrentReplay = await findMessageReplay(this.prisma, clientMessageId, userId, {
          channelId,
          threadParentId
        })
        if (concurrentReplay) {
          return {
            ...this.mapToWire(concurrentReplay, userId),
            serverId: destination.serverId,
            threadUpdate: undefined,
            replayed: true
          }
        }
      }
      throw error
    }

    const { channel, ...rest } = created
    const wire = this.mapToWire(rest as any, userId)

    let threadUpdate: { parentId: string; threadCount: number } | undefined
    if (threadParentId) {
      const threadCount = await this.prisma.message.count({
        where: { threadParentId, deleted: false }
      })
      threadUpdate = { parentId: threadParentId, threadCount }
    }

    // Fire-and-forget XP award. We don't want leveling bugs (or Redis hiccups)
    // to block message delivery — errors are already logged inside XpService.
    if (channel?.serverId) {
      void this.xp
        .tryAwardForMessage(channel.serverId, userId)
        .catch((err) => this.logger.warn(`XP award failed: ${(err as Error).message}`))
    }

    return { ...wire, serverId: channel!.serverId, threadUpdate, replayed: false }
  }

  async getThreadMessages(
    parentId: string,
    userId: string,
    opts?: { cursor?: string; after?: string; around?: string; limit?: number }
  ): Promise<{ messages: ReturnType<typeof this.mapToWire>[]; hasMore: boolean; hasNewer?: boolean }> {
    const parent = await this.prisma.message.findUnique({
      where: { id: parentId },
      select: { channelId: true }
    })
    if (!parent?.channelId) throw new NotFoundException('Parent message not found')
    await this.requireMessageChannelMember(parent.channelId, userId)

    const take = Math.min(Math.max(1, opts?.limit ?? 50), 100)

    const baseWhere: Prisma.MessageWhereInput = {
      threadParentId: parentId,
      deleted: false
    }

    if (opts?.around) {
      const anchor = await this.prisma.message.findFirst({
        where: { id: opts.around, threadParentId: parentId, deleted: false },
        include: historyInclude(userId)
      })
      if (!anchor) {
        return this.getThreadMessages(parentId, userId, { limit: take })
      }

      const beforeTake = Math.floor(take / 2)
      const afterTake = Math.max(0, take - beforeTake - 1)

      const [beforeRows, afterRows] = await Promise.all([
        this.prisma.message.findMany({
          where: {
            AND: [
              baseWhere,
              {
                OR: [
                  { createdAt: { lt: anchor.createdAt } },
                  { AND: [{ createdAt: anchor.createdAt }, { id: { lt: anchor.id } }] }
                ]
              }
            ]
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: beforeTake + 1,
          include: historyInclude(userId)
        }),
        this.prisma.message.findMany({
          where: {
            AND: [
              baseWhere,
              {
                OR: [
                  { createdAt: { gt: anchor.createdAt } },
                  { AND: [{ createdAt: anchor.createdAt }, { id: { gt: anchor.id } }] }
                ]
              }
            ]
          },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          take: afterTake + 1,
          include: historyInclude(userId)
        })
      ])

      const hasMore = beforeRows.length > beforeTake
      const hasNewer = afterRows.length > afterTake
      const before = (hasMore ? beforeRows.slice(0, beforeTake) : beforeRows).reverse()
      const after = hasNewer ? afterRows.slice(0, afterTake) : afterRows
      const page = [...before, anchor, ...after]

      return {
        messages: await mapHistory(this.prisma, page, userId),
        hasMore,
        hasNewer
      }
    }

    if (opts?.after) {
      const cursorMsg = await this.prisma.message.findFirst({
        where: { id: opts.after, threadParentId: parentId, deleted: false }
      })
      if (!cursorMsg) throw new BadRequestException('Invalid after cursor')

      const rows = await this.prisma.message.findMany({
        where: {
          AND: [
            baseWhere,
            {
              OR: [
                { createdAt: { gt: cursorMsg.createdAt } },
                { AND: [{ createdAt: cursorMsg.createdAt }, { id: { gt: cursorMsg.id } }] }
              ]
            }
          ]
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: take + 1,
        include: historyInclude(userId)
      })

      const hasNewer = rows.length > take
      const page = hasNewer ? rows.slice(0, take) : rows
      return {
        messages: await mapHistory(this.prisma, page, userId),
        hasMore: false,
        hasNewer
      }
    }

    if (opts?.cursor) {
      const cursorMsg = await this.prisma.message.findFirst({
        where: { id: opts.cursor, threadParentId: parentId, deleted: false }
      })
      if (!cursorMsg) throw new BadRequestException('Invalid cursor')

      const rows = await this.prisma.message.findMany({
        where: {
          AND: [
            baseWhere,
            {
              OR: [
                { createdAt: { lt: cursorMsg.createdAt } },
                { AND: [{ createdAt: cursorMsg.createdAt }, { id: { lt: cursorMsg.id } }] }
              ]
            }
          ]
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: take + 1,
        include: historyInclude(userId)
      })

      const hasMore = rows.length > take
      const page = (hasMore ? rows.slice(0, take) : rows).reverse()
      return {
        messages: await mapHistory(this.prisma, page, userId),
        hasMore,
        hasNewer: false
      }
    }

    const rows = await this.prisma.message.findMany({
      where: baseWhere,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      include: historyInclude(userId)
    })

    const hasMore = rows.length > take
    const page = (hasMore ? rows.slice(0, take) : rows).reverse()
    return {
      messages: await mapHistory(this.prisma, page, userId),
      hasMore,
      hasNewer: false
    }
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
    await this.requireMessageChannelMember(message.channelId, userId)
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
    await this.requireMessageChannelMember(message.channelId, userId)

    if (message.deleted) {
      return { id: messageId, deleted: true }
    }

    const isAuthor = message.authorId === userId
    if (!isAuthor) {
      await this.roles.requirePermission(message.channel.serverId, userId, Permission.MANAGE_MESSAGES)
    }

    await this.prisma.message.update({
      where: { id: messageId },
      data: { deleted: true, deletedAt: new Date(), content: null }
    })

    return { id: messageId, deleted: true }
  }

  async pinMessage(messageId: string, userId: string, channelId: string) {
    const channel = await this.requireMessageChannelMember(channelId, userId)
    await this.roles.requirePermission(channel.serverId, userId, Permission.MANAGE_MESSAGES)

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
    const channel = await this.requireMessageChannelMember(channelId, userId)
    await this.roles.requirePermission(channel.serverId, userId, Permission.MANAGE_MESSAGES)

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
      await this.requireMessageChannelMember(message.channelId, userId)
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

  async getReactors(contextId: string, messageId: string, userId: string, emoji: string, after?: string, mode: 'channel' | 'dm' = 'channel') {
    if (mode === 'channel') await this.requireMessageChannelMember(contextId, userId)
    else {
      const member = await this.prisma.directConversationMember.findUnique({ where: { conversationId_userId: { conversationId: contextId, userId } } })
      if (!member) throw new ForbiddenException('Not a member of this conversation')
    }
    const message = await this.prisma.message.findFirst({ where: { id: messageId,
      ...(mode === 'channel' ? { channelId: contextId } : { directConversationId: contextId }), deleted: false }, select: { id: true } })
    if (!message) throw new NotFoundException('Message not found')
    if (typeof emoji !== 'string' || !emoji || emoji.length > 200 || (after && !/^[0-9a-f-]{36}$/i.test(after))) {
      throw new BadRequestException('Invalid reaction query')
    }
    const rows = await this.prisma.reaction.findMany({
      where: { messageId, emoji, ...(after ? { userId: { gt: after } } : {}) },
      orderBy: { userId: 'asc' }, take: 101, select: { userId: true }
    })
    return { userIds: rows.slice(0, 100).map((r) => r.userId), nextCursor: rows.length > 100 ? rows[99].userId : null }
  }

  async getPinnedMessages(channelId: string, userId: string) {
    await this.requireMessageChannelMember(channelId, userId)

    const rows = await this.prisma.message.findMany({
      where: { channelId, pinned: true, deleted: false },
      orderBy: { createdAt: 'desc' },
      include: messageInclude
    })

    return rows.map((m) => this.mapToWire(m, userId))
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
    await this.roles.requireChannelPermission(channel.serverId, channelId, userId, Permission.VIEW_CHANNEL)
    return channel
  }
}
