import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class ReadStateService {
  constructor(private readonly prisma: PrismaService) {}

  async getAllForUser(userId: string) {
    const [channelRows, dmRows] = await Promise.all([
      this.prisma.$queryRaw<
        {
          channel_id: string
          last_read_at: Date
          mention_count: number
          server_id: string
          unread_count: bigint
        }[]
      >`
        SELECT crs.channel_id, crs.last_read_at, crs.mention_count, c.server_id,
          (SELECT COUNT(*) FROM (
            SELECT 1 FROM messages m
            WHERE m.channel_id = crs.channel_id
              AND m.created_at > crs.last_read_at
              AND m.deleted = false
              AND m.author_id != ${userId}
            LIMIT 100
          ) sub) AS unread_count
        FROM channel_read_states crs
        JOIN channels c ON c.id = crs.channel_id
        WHERE crs.user_id = ${userId}
      `,
      this.prisma.$queryRaw<
        {
          conversation_id: string
          last_read_at: Date
          mention_count: number
          unread_count: bigint
        }[]
      >`
        SELECT drs.conversation_id, drs.last_read_at, drs.mention_count,
          (SELECT COUNT(*) FROM (
            SELECT 1 FROM messages m
            WHERE m.direct_conversation_id = drs.conversation_id
              AND m.created_at > drs.last_read_at
              AND m.deleted = false
              AND m.author_id != ${userId}
            LIMIT 100
          ) sub) AS unread_count
        FROM dm_read_states drs
        WHERE drs.user_id = ${userId}
      `
    ])

    const channels = channelRows.map((r) => ({
      channelId: r.channel_id,
      lastReadAt: r.last_read_at.toISOString(),
      mentionCount: Number(r.mention_count),
      serverId: r.server_id,
      unreadCount: Number(r.unread_count)
    }))

    const dms = dmRows.map((r) => ({
      conversationId: r.conversation_id,
      lastReadAt: r.last_read_at.toISOString(),
      mentionCount: Number(r.mention_count),
      unreadCount: Number(r.unread_count)
    }))

    return { channels, dms }
  }

  async ackChannel(userId: string, channelId: string) {
    await this.prisma.channelReadState.upsert({
      where: { userId_channelId: { userId, channelId } },
      update: { lastReadAt: new Date(), mentionCount: 0 },
      create: { userId, channelId, lastReadAt: new Date(), mentionCount: 0 }
    })
  }

  async ackDm(userId: string, conversationId: string) {
    await this.prisma.dmReadState.upsert({
      where: { userId_conversationId: { userId, conversationId } },
      update: { lastReadAt: new Date(), mentionCount: 0 },
      create: {
        userId,
        conversationId,
        lastReadAt: new Date(),
        mentionCount: 0
      }
    })
  }

  async incrementMention(channelId: string, userIds: string[]) {
    if (userIds.length === 0) return
    await Promise.all(
      userIds.map((userId) =>
        this.prisma.channelReadState.upsert({
          where: { userId_channelId: { userId, channelId } },
          update: { mentionCount: { increment: 1 } },
          create: {
            userId,
            channelId,
            lastReadAt: new Date(0),
            mentionCount: 1
          }
        })
      )
    )
  }

  async incrementDmMention(conversationId: string, userIds: string[]) {
    if (userIds.length === 0) return
    await Promise.all(
      userIds.map((userId) =>
        this.prisma.dmReadState.upsert({
          where: { userId_conversationId: { userId, conversationId } },
          update: { mentionCount: { increment: 1 } },
          create: {
            userId,
            conversationId,
            lastReadAt: new Date(0),
            mentionCount: 1
          }
        })
      )
    )
  }

  /**
   * Parse @mentions from message content and return matching user IDs
   * that are members of the given server.
   *
   * Supports: @username, @DisplayName (single word), @"Display Name" (quoted, multi-word).
   * Matches against both username and displayName (case-insensitive).
   */
  async resolveMentions(content: string, serverId: string, excludeUserId: string): Promise<string[]> {
    const mentions = new Set<string>()

    const quotedPattern = /@"([^"]+)"/g
    let match: RegExpExecArray | null
    while ((match = quotedPattern.exec(content)) !== null) {
      mentions.add(match[1].toLowerCase())
    }

    const wordPattern = /@(\w+)/g
    while ((match = wordPattern.exec(content)) !== null) {
      mentions.add(match[1].toLowerCase())
    }

    if (mentions.size === 0) return []

    const members = await this.prisma.serverMember.findMany({
      where: { serverId },
      include: { user: { select: { id: true, username: true, displayName: true } } }
    })

    return members
      .filter(
        (m) =>
          m.userId !== excludeUserId &&
          (mentions.has(m.user.username.toLowerCase()) ||
            (m.user.displayName && mentions.has(m.user.displayName.toLowerCase())))
      )
      .map((m) => m.userId)
  }
}
