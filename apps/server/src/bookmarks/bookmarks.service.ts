import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { hasPermission, Permission } from '@chat/shared'
import { PrismaService } from '../prisma/prisma.service'
import { RolesService } from '../roles/roles.service'

const messageInclude = {
  author: {
    select: { id: true, username: true, displayName: true, avatarUrl: true }
  },
  attachments: true,
  channel: { select: { id: true, name: true, serverId: true } },
  linkPreviews: {
    select: { id: true, url: true, title: true, description: true, imageUrl: true, siteName: true }
  }
} as const

@Injectable()
export class BookmarksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly roles: RolesService,
  ) {}

  async toggle(userId: string, messageId: string, note?: string) {
    const existing = await this.prisma.messageBookmark.findUnique({
      where: { userId_messageId: { userId, messageId } }
    })
    if (existing) {
      await this.prisma.messageBookmark.delete({ where: { id: existing.id } })
      return { action: 'removed' as const, messageId }
    }
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: { id: true, channelId: true, directConversationId: true, channel: { select: { serverId: true } } }
    })
    if (!message) throw new NotFoundException('Message not found')
    if (message.channelId && message.channel?.serverId) {
      await this.roles.requireChannelPermission(message.channel.serverId, message.channelId, userId, Permission.VIEW_CHANNEL)
    }
    if (message.directConversationId) {
      const dmMember = await this.prisma.directConversationMember.findUnique({
        where: { conversationId_userId: { conversationId: message.directConversationId, userId } }
      })
      if (!dmMember) throw new ForbiddenException('Not a member of this conversation')
    }
    try {
      const bookmark = await this.prisma.messageBookmark.create({
        data: { userId, messageId, note }
      })
      return { action: 'added' as const, messageId, bookmarkId: bookmark.id }
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Already bookmarked')
      }
      throw e
    }
  }

  async list(userId: string, cursor?: string, limit = 50) {
    const bookmarks = await this.prisma.messageBookmark.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        message: { include: messageInclude }
      }
    })
    const hasMore = bookmarks.length > limit
    if (hasMore) bookmarks.pop()

    const filtered = []
    for (const bm of bookmarks) {
      const serverId = bm.message.channel?.serverId
      const channelId = bm.message.channelId
      if (serverId && channelId) {
        try {
          const perms = await this.roles.getChannelPermissions(serverId, channelId, userId)
          if (!hasPermission(perms, Permission.VIEW_CHANNEL)) continue
        } catch { continue }
      }
      if (bm.message.directConversationId) {
        try {
          const dmMember = await this.prisma.directConversationMember.findUnique({
            where: { conversationId_userId: { conversationId: bm.message.directConversationId, userId } }
          })
          if (!dmMember) continue
        } catch { continue }
      }
      filtered.push(bm)
    }
    return { bookmarks: filtered, hasMore }
  }

  async listIds(userId: string) {
    const rows = await this.prisma.messageBookmark.findMany({
      where: { userId },
      select: { messageId: true }
    })
    return rows.map((r) => r.messageId)
  }

  async remove(userId: string, messageId: string) {
    const bookmark = await this.prisma.messageBookmark.findUnique({
      where: { userId_messageId: { userId, messageId } }
    })
    if (!bookmark) throw new NotFoundException('Bookmark not found')
    await this.prisma.messageBookmark.delete({ where: { id: bookmark.id } })
  }

  async check(userId: string, messageId: string) {
    const bookmark = await this.prisma.messageBookmark.findUnique({
      where: { userId_messageId: { userId, messageId } }
    })
    return { bookmarked: !!bookmark }
  }

  async removeForServer(userId: string, serverId: string) {
    await this.prisma.messageBookmark.deleteMany({
      where: {
        userId,
        message: { channel: { serverId } }
      }
    })
  }
}
