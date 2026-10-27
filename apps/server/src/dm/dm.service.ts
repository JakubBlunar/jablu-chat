import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '../prisma-client'
import { FriendsService } from '../friends/friends.service'
import { MessagesService } from '../messages/messages.service'
import { PrismaService } from '../prisma/prisma.service'
import { EventBusService } from '../events/event-bus.service'
import { findMessageReplay } from '../messages/message-replay'
import { extractUrls } from '../messages/link-preview-parse'
import { historyDmInclude, mapDmHistory } from '../messages/history-wire'
import {
  dmMessageInclude as messageInclude,
  mapDmMessageToWire,
  type DmMessageWithRelations as MessageWithRelations
} from '../messages/message-wire'

const memberSelect = {
  userId: true,
  isFavorite: true,
  muted: true,
  user: {
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      bio: true,
      isBot: true,
      status: true,
      createdAt: true
    }
  }
} satisfies Prisma.DirectConversationMemberSelect

@Injectable()
export class DmService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly friendsService: FriendsService,
    private readonly messages: MessagesService,
    private readonly events: EventBusService
  ) {}

  mapToWire(m: MessageWithRelations) {
    return mapDmMessageToWire(m)
  }

  async getConversationReadStates(conversationId: string, userId: string) {
    await this.requireMembership(conversationId, userId)
    const states = await this.prisma.dmReadState.findMany({
      where: { conversationId },
      select: { userId: true, lastReadAt: true }
    })
    return states.map((s) => ({
      userId: s.userId,
      lastReadAt: s.lastReadAt.toISOString()
    }))
  }

  async requireMembership(conversationId: string, userId: string) {
    const member = await this.prisma.directConversationMember.findUnique({
      where: {
        conversationId_userId: { conversationId, userId }
      }
    })
    if (!member) {
      throw new ForbiddenException('You are not a member of this conversation')
    }
    return member
  }

  async findOrCreateDm(currentUserId: string, recipientId: string) {
    if (currentUserId === recipientId) {
      throw new BadRequestException('Cannot create a DM with yourself')
    }

    const recipient = await this.prisma.user.findUnique({
      where: { id: recipientId },
      select: { id: true, dmPrivacy: true, isBot: true }
    })
    if (!recipient) {
      throw new NotFoundException('User not found')
    }

    const existing = await this.prisma.directConversation.findFirst({
      where: {
        isGroup: false,
        AND: [{ members: { some: { userId: currentUserId } } }, { members: { some: { userId: recipientId } } }]
      },
      include: { members: { select: memberSelect } }
    })

    if (existing) {
      await this.prisma.directConversationMember.updateMany({
        where: { conversationId: existing.id, userId: currentUserId, closedAt: { not: null } },
        data: { closedAt: null }
      })
      return this.toConversationWire(existing, currentUserId)
    }

    if (!recipient.isBot && recipient.dmPrivacy === 'friends_only') {
      const friends = await this.friendsService.areFriends(currentUserId, recipientId)
      if (!friends) {
        throw new BadRequestException('This user only accepts DMs from friends')
      }
    }

    const created = await this.prisma.directConversation.create({
      data: {
        isGroup: false,
        members: {
          create: [{ userId: currentUserId }, { userId: recipientId }]
        }
      },
      include: { members: { select: memberSelect } }
    })

    return this.toConversationWire(created, currentUserId)
  }

  async createGroupDm(currentUserId: string, memberIds: string[], groupName?: string) {
    const uniqueIds = [...new Set([currentUserId, ...memberIds])]
    if (uniqueIds.length < 3) {
      throw new BadRequestException('Group DMs require at least 3 participants')
    }
    if (uniqueIds.length > 10) {
      throw new BadRequestException('Group DMs are limited to 10 participants')
    }

    await this.validateGroupPrivacy(this.prisma, uniqueIds)

    const created = await this.prisma.directConversation.create({
      data: {
        isGroup: true,
        groupName: groupName?.trim() || null,
        members: {
          create: uniqueIds.map((id) => ({ userId: id }))
        }
      },
      include: { members: { select: memberSelect } }
    })
    this.events.emit('dm:conversation-changed', { conversationId: created.id, userIds: uniqueIds })
    return this.toConversationWire(created, currentUserId)
  }

  private async validateGroupPrivacy(db: Pick<Prisma.TransactionClient, 'user' | 'friendship'>, uniqueIds: string[]) {
    const users = await db.user.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true, dmPrivacy: true }
    })
    if (users.length !== uniqueIds.length) {
      throw new BadRequestException('One or more users not found')
    }

    const privacyUsers = users.filter((u) => u.dmPrivacy === 'friends_only')
    if (privacyUsers.length > 0) {
      const privacyUserIds = privacyUsers.map((u) => u.id)
      const friendships = await db.friendship.findMany({
        where: {
          status: 'accepted',
          OR: [
            { requesterId: { in: privacyUserIds }, addresseeId: { in: uniqueIds } },
            { requesterId: { in: uniqueIds }, addresseeId: { in: privacyUserIds } }
          ]
        },
        select: { requesterId: true, addresseeId: true }
      })
      const pairSet = new Set(friendships.map((f) => [f.requesterId, f.addresseeId].sort().join(':')))
      for (const pu of privacyUsers) {
        for (const other of uniqueIds) {
          if (other === pu.id) continue
          if (!pairSet.has([pu.id, other].sort().join(':'))) {
            throw new BadRequestException('All members must be friends with each other to create this group DM')
          }
        }
      }
    }
  }

  private async lockGroup(tx: Prisma.TransactionClient, conversationId: string, userId: string) {
    await tx.$queryRaw`SELECT id FROM direct_conversations WHERE id = ${conversationId} FOR UPDATE`
    const conversation = await tx.directConversation.findUnique({
      where: { id: conversationId },
      include: { members: { select: memberSelect } }
    })
    if (!conversation?.members.some((member) => member.userId === userId)) {
      throw new ForbiddenException('You are not a member of this conversation')
    }
    if (!conversation.isGroup) throw new BadRequestException('This action is only available in group DMs')
    return conversation
  }

  async updatePreferences(conversationId: string, userId: string, data: { isFavorite?: boolean; muted?: boolean }) {
    await this.requireMembership(conversationId, userId)
    await this.prisma.directConversationMember.update({
      where: { conversationId_userId: { conversationId, userId } },
      data
    })
    this.events.emit('dm:conversation-changed', { conversationId, userIds: [userId] })
    return this.getConversation(conversationId, userId)
  }

  async updateGroup(
    conversationId: string,
    userId: string,
    data: { groupName?: string | null; groupAvatarUrl?: string | null }
  ) {
    const updated = await this.prisma.$transaction(async (tx) => {
      await this.lockGroup(tx, conversationId, userId)
      return tx.directConversation.update({
        where: { id: conversationId },
        data: { ...data, ...(data.groupName !== undefined ? { groupName: data.groupName?.trim() || null } : {}) },
        include: { members: { select: memberSelect } }
      })
    })
    this.events.emit('dm:conversation-changed', {
      conversationId,
      userIds: updated.members.map((member) => member.userId)
    })
    return this.toConversationWire(updated, userId)
  }

  async addGroupMembers(conversationId: string, userId: string, memberIds: string[]) {
    const updated = await this.prisma.$transaction(async (tx) => {
      const group = await this.lockGroup(tx, conversationId, userId)
      const ids = [...new Set([...group.members.map((member) => member.userId), ...memberIds])]
      if (ids.length > 10) throw new BadRequestException('Group DMs are limited to 10 participants')
      await this.validateGroupPrivacy(tx, ids)
      const currentIds = new Set(group.members.map((member) => member.userId))
      await tx.directConversationMember.createMany({
        data: ids.filter((id) => !currentIds.has(id)).map((id) => ({ conversationId, userId: id }))
      })
      return tx.directConversation.findUniqueOrThrow({
        where: { id: conversationId },
        include: { members: { select: memberSelect } }
      })
    })
    const userIds = updated.members.map((member) => member.userId)
    this.events.emit('dm:conversation-changed', { conversationId, userIds })
    this.events.emit('dm:members-changed', { conversationId, userIds })
    return this.toConversationWire(updated, userId)
  }

  async leaveGroup(conversationId: string, userId: string) {
    const userIds = await this.prisma.$transaction(async (tx) => {
      const group = await this.lockGroup(tx, conversationId, userId)
      await tx.directConversationMember.delete({ where: { conversationId_userId: { conversationId, userId } } })
      await tx.dmReadState.deleteMany({ where: { conversationId, userId } })
      return group.members.filter((member) => member.userId !== userId).map((member) => member.userId)
    })
    this.events.emit('dm:member-left', { conversationId, userId })
    this.events.emit('dm:members-changed', { conversationId, userIds, removedUserId: userId })
    this.events.emit('dm:conversation-changed', { conversationId, userIds })
    return { ok: true }
  }

  async closeConversation(conversationId: string, userId: string) {
    await this.requireMembership(conversationId, userId)
    await this.prisma.directConversationMember.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { closedAt: new Date() }
    })
  }

  async openConversation(conversationId: string, userId: string) {
    await this.prisma.directConversationMember.updateMany({
      where: { conversationId, userId, closedAt: { not: null } },
      data: { closedAt: null }
    })
  }

  async getConversations(userId: string) {
    const conversations = await this.prisma.directConversation.findMany({
      where: { members: { some: { userId, closedAt: null } } },
      include: {
        members: { select: memberSelect },
        messages: {
          where: { deleted: false },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            content: true,
            authorId: true,
            createdAt: true,
            attachments: { select: { type: true, filename: true }, take: 1 },
            author: { select: { username: true, displayName: true } }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    })

    return conversations
      .map((c) => {
        const lastMessage = c.messages[0] ?? null
        return {
          ...this.toConversationWire(c, userId),
          lastMessage: lastMessage
            ? {
                content: lastMessage.content,
                authorId: lastMessage.authorId,
                authorName: lastMessage.author?.displayName ?? lastMessage.author?.username ?? null,
                createdAt: lastMessage.createdAt,
                attachment: lastMessage.attachments[0] ?? null
              }
            : null
        }
      })
      .sort((a, b) => {
        const aTime = a.lastMessage?.createdAt ?? new Date(a.createdAt)
        const bTime = b.lastMessage?.createdAt ?? new Date(b.createdAt)
        return Number(b.isFavorite) - Number(a.isFavorite) || new Date(bTime).getTime() - new Date(aTime).getTime()
      })
  }

  async getConversation(conversationId: string, userId: string) {
    await this.requireMembership(conversationId, userId)
    const conversation = await this.prisma.directConversation.findUnique({
      where: { id: conversationId },
      include: { members: { select: memberSelect } }
    })
    if (!conversation) {
      throw new NotFoundException('Conversation not found')
    }
    return this.toConversationWire(conversation, userId)
  }

  async getMessages(conversationId: string, userId: string, cursor?: string, limit = 50) {
    await this.requireMembership(conversationId, userId)
    const take = Math.min(Math.max(1, limit), 100)

    const baseWhere: Prisma.MessageWhereInput = {
      directConversationId: conversationId,
      deleted: false
    }

    let where: Prisma.MessageWhereInput = baseWhere
    if (cursor) {
      const cursorMsg = await this.prisma.message.findFirst({
        where: {
          id: cursor,
          directConversationId: conversationId,
          deleted: false
        }
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
      include: historyDmInclude
    })

    const hasMore = rows.length > take
    const page = hasMore ? rows.slice(0, take) : rows
    return {
      messages: await mapDmHistory(this.prisma, page, userId),
      hasMore
    }
  }

  getReactors(conversationId: string, messageId: string, userId: string, emoji: string, after?: string) {
    return this.messages.getReactors(conversationId, messageId, userId, emoji, after, 'dm')
  }

  async getMessagesAround(conversationId: string, userId: string, messageId: string, limit = 50) {
    await this.requireMembership(conversationId, userId)
    const half = Math.floor(Math.min(Math.max(1, limit), 100) / 2)

    const anchor = await this.prisma.message.findFirst({
      where: { id: messageId, directConversationId: conversationId, deleted: false }
    })
    if (!anchor) {
      return this.getMessages(conversationId, userId, undefined, limit)
    }

    const [before, after] = await Promise.all([
      this.prisma.message.findMany({
        where: {
          directConversationId: conversationId,
          deleted: false,
          OR: [
            { createdAt: { lt: anchor.createdAt } },
            { AND: [{ createdAt: anchor.createdAt }, { id: { lt: anchor.id } }] }
          ]
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: half,
        include: historyDmInclude
      }),
      this.prisma.message.findMany({
        where: {
          directConversationId: conversationId,
          deleted: false,
          OR: [
            { createdAt: { gt: anchor.createdAt } },
            { AND: [{ createdAt: anchor.createdAt }, { id: { gt: anchor.id } }] }
          ]
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: half,
        include: historyDmInclude
      })
    ])

    const anchorRow = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: historyDmInclude
    })

    const allDesc = [...after.reverse(), ...(anchorRow ? [anchorRow] : []), ...before]

    return {
      messages: await mapDmHistory(this.prisma, allDesc, userId),
      hasMore: before.length >= half,
      hasNewer: after.length >= half
    }
  }

  async getMessagesAfter(conversationId: string, userId: string, afterId: string, limit = 50) {
    await this.requireMembership(conversationId, userId)
    const take = Math.min(Math.max(1, limit), 100)

    const afterMsg = await this.prisma.message.findFirst({
      where: { id: afterId, directConversationId: conversationId, deleted: false }
    })
    if (!afterMsg) {
      throw new BadRequestException('Invalid after cursor')
    }

    const rows = await this.prisma.message.findMany({
      where: {
        directConversationId: conversationId,
        deleted: false,
        OR: [
          { createdAt: { gt: afterMsg.createdAt } },
          { AND: [{ createdAt: afterMsg.createdAt }, { id: { gt: afterMsg.id } }] }
        ]
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: take + 1,
      include: historyDmInclude
    })

    const hasNewer = rows.length > take
    const page = hasNewer ? rows.slice(0, take) : rows
    return {
      messages: await mapDmHistory(this.prisma, page.reverse(), userId),
      hasMore: false,
      hasNewer
    }
  }

  async createMessage(
    conversationId: string,
    userId: string,
    content?: string,
    replyToId?: string,
    attachmentIds?: string[],
    forwardFromMessageId?: string,
    clientMessageId?: string
  ): Promise<ReturnType<typeof mapDmMessageToWire> & { replayed?: boolean }> {
    await this.requireMembership(conversationId, userId)
    const replay = await findMessageReplay(this.prisma, clientMessageId, userId, { conversationId })
    if (replay) return { ...this.mapToWire(replay), replayed: true }

    const trimmed = content?.trim()
    const hasAttachments = !!attachmentIds?.length
    const hasForward = !!forwardFromMessageId
    if (!trimmed && !hasAttachments && !hasForward) {
      throw new BadRequestException('Message must have content or at least one attachment')
    }

    if (replyToId) {
      const parent = await this.prisma.message.findFirst({
        where: { id: replyToId, directConversationId: conversationId }
      })
      if (!parent) {
        throw new BadRequestException('Invalid replyToId')
      }
    }

    const forwardSnapshot = hasForward ? await this.messages.buildForwardSnapshot(forwardFromMessageId!, userId) : null

    let created: MessageWithRelations
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

        const msg = await tx.message.create({
          data: {
            id: clientMessageId,
            directConversationId: conversationId,
            authorId: userId,
            content: trimmed ?? null,
            replyToId: replyToId ?? undefined,
            attachments: hasAttachments ? { connect: attachmentIds!.map((id) => ({ id })) } : undefined,
            ...(forwardSnapshot ?? {})
          },
          include: messageInclude
        })

        await tx.directConversationMember.updateMany({
          where: { conversationId, closedAt: { not: null } },
          data: { closedAt: null }
        })

        return msg
      })
    } catch (error) {
      if (
        clientMessageId &&
        ((error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') ||
          error instanceof BadRequestException)
      ) {
        const concurrentReplay = await findMessageReplay(this.prisma, clientMessageId, userId, { conversationId })
        if (concurrentReplay) return { ...this.mapToWire(concurrentReplay), replayed: true }
      }
      throw error
    }

    return this.mapToWire(created)
  }

  async editMessage(conversationId: string, messageId: string, userId: string, content: string) {
    await this.requireMembership(conversationId, userId)
    const message = await this.prisma.message.findFirst({
      where: { id: messageId, directConversationId: conversationId }
    })
    if (!message) throw new NotFoundException('Message not found')
    if (message.deleted) {
      throw new ForbiddenException('Cannot edit a deleted message')
    }
    if (message.authorId !== userId) {
      throw new ForbiddenException('You can only edit your own messages')
    }

    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: { content: content.trim(), editedAt: new Date() },
      include: messageInclude
    })

    return this.mapToWire(updated)
  }

  async deleteMessage(conversationId: string, messageId: string, userId: string) {
    await this.requireMembership(conversationId, userId)
    const message = await this.prisma.message.findFirst({
      where: { id: messageId, directConversationId: conversationId }
    })
    if (!message) throw new NotFoundException('Message not found')
    if (message.deleted) return { id: messageId, deleted: true }
    if (message.authorId !== userId) {
      throw new ForbiddenException('You can only delete your own messages')
    }

    await this.prisma.message.update({
      where: { id: messageId },
      data: { deleted: true, deletedAt: new Date(), content: null }
    })

    return { id: messageId, deleted: true }
  }

  async getConversationMemberIds(conversationId: string): Promise<string[]> {
    const members = await this.prisma.directConversationMember.findMany({
      where: { conversationId },
      select: { userId: true }
    })
    return members.map((m) => m.userId)
  }

  async canDmUser(currentUserId: string, targetUserId: string): Promise<{ allowed: boolean }> {
    if (currentUserId === targetUserId) return { allowed: true }

    const targetUser = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { dmPrivacy: true, isBot: true }
    })

    if (!targetUser) return { allowed: false }
    if (targetUser.isBot) return { allowed: true }
    if (targetUser.dmPrivacy !== 'friends_only') return { allowed: true }

    const friends = await this.friendsService.areFriends(currentUserId, targetUserId)
    return { allowed: friends }
  }

  async pinMessage(conversationId: string, messageId: string, userId: string) {
    await this.requireMembership(conversationId, userId)

    const message = await this.prisma.message.findFirst({
      where: { id: messageId, directConversationId: conversationId }
    })
    if (!message) throw new NotFoundException('Message not found')
    if (message.deleted) throw new BadRequestException('Cannot pin a deleted message')

    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: { pinned: true },
      include: messageInclude
    })

    return this.mapToWire(updated)
  }

  async unpinMessage(conversationId: string, messageId: string, userId: string) {
    await this.requireMembership(conversationId, userId)

    const message = await this.prisma.message.findFirst({
      where: { id: messageId, directConversationId: conversationId }
    })
    if (!message) throw new NotFoundException('Message not found')

    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: { pinned: false },
      include: messageInclude
    })

    return this.mapToWire(updated)
  }

  async getPinnedMessages(conversationId: string, userId: string) {
    await this.requireMembership(conversationId, userId)

    const rows = await this.prisma.message.findMany({
      where: { directConversationId: conversationId, pinned: true, deleted: false },
      orderBy: { createdAt: 'desc' },
      include: messageInclude
    })

    return rows.map((m) => this.mapToWire(m))
  }

  async getLinks(conversationId: string, userId: string, page: number, limit: number) {
    await this.requireMembership(conversationId, userId)
    const where = Prisma.sql`WHERE direct_conversation_id = ${conversationId} AND deleted = false
      AND content ~* 'https?://[^[:space:]<>]+'`
    const [ids, counts] = await this.prisma.$transaction([
      this.prisma.$queryRaw<{ id: string }[]>(
        Prisma.sql`SELECT id FROM messages ${where} ORDER BY created_at DESC, id DESC LIMIT ${limit} OFFSET ${page * limit}`
      ),
      this.prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`SELECT count(*) FROM messages ${where}`)
    ])
    const rows = ids.length
      ? await this.prisma.message.findMany({
          where: { id: { in: ids.map((row) => row.id) }, directConversationId: conversationId, deleted: false },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          select: {
            id: true,
            content: true,
            createdAt: true,
            author: { select: { username: true, displayName: true } },
            linkPreviews: { select: { url: true, title: true, description: true } }
          }
        })
      : []
    return {
      items: rows.map((row) => {
        const previews = new Map(row.linkPreviews.map((preview) => [preview.url, preview]))
        return {
          messageId: row.id,
          createdAt: row.createdAt.toISOString(),
          authorName: row.author?.displayName ?? row.author?.username ?? null,
          links: extractUrls(row.content, Infinity).map((url) => ({
            url,
            title: previews.get(url)?.title ?? null,
            description: previews.get(url)?.description ?? null
          }))
        }
      }),
      total: Number(counts[0]?.count ?? 0)
    }
  }

  async getAttachments(conversationId: string, userId: string, kind: 'media' | 'files', page: number, limit: number) {
    await this.requireMembership(conversationId, userId)
    const types: ('image' | 'gif' | 'video' | 'file')[] = kind === 'files' ? ['file'] : ['image', 'gif', 'video']
    const where: Prisma.AttachmentWhereInput = {
      type: { in: types },
      message: { is: { directConversationId: conversationId, deleted: false } }
    }
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.attachment.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: page * limit,
        take: limit,
        include: { message: { select: { createdAt: true, author: { select: { username: true, displayName: true } } } } }
      }),
      this.prisma.attachment.count({ where })
    ])
    return {
      items: rows.map(({ message, ...attachment }) => ({
        ...attachment,
        createdAt: message?.createdAt.toISOString(),
        authorName: message?.author?.displayName ?? message?.author?.username ?? null
      })),
      total
    }
  }

  private toConversationWire(
    c: Prisma.DirectConversationGetPayload<{
      include: { members: { select: typeof memberSelect } }
    }>,
    viewerId: string
  ) {
    const member = c.members.find((m) => m.userId === viewerId)
    return {
      id: c.id,
      isGroup: c.isGroup,
      groupName: c.groupName,
      groupAvatarUrl: c.groupAvatarUrl,
      isFavorite: member?.isFavorite ?? false,
      muted: member?.muted ?? false,
      createdAt: c.createdAt.toISOString(),
      members: c.members.map((m) => ({
        userId: m.user.id,
        username: m.user.username,
        displayName: m.user.displayName,
        avatarUrl: m.user.avatarUrl,
        bio: m.user.bio,
        isBot: m.user.isBot,
        status: m.user.status,
        createdAt: m.user.createdAt.toISOString()
      }))
    }
  }
}
