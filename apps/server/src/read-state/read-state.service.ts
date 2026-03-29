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

  async ackServer(userId: string, serverId: string) {
    const channels = await this.prisma.channel.findMany({
      where: { serverId },
      select: { id: true }
    })
    if (channels.length === 0) return
    const now = new Date()
    await Promise.all(
      channels.map((ch) =>
        this.prisma.channelReadState.upsert({
          where: { userId_channelId: { userId, channelId: ch.id } },
          update: { lastReadAt: now, mentionCount: 0 },
          create: { userId, channelId: ch.id, lastReadAt: now, mentionCount: 0 }
        })
      )
    )
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
   * Supports: @username, @DisplayName (single word), @"Display Name" (quoted, multi-word),
   * @everyone (all members), @here (online members only).
   * @everyone and @here are restricted to admin/owner roles.
   */
  async resolveMentions(
    content: string,
    serverId: string,
    excludeUserId: string,
    onlineUserIds?: string[]
  ): Promise<{ userIds: string[]; everyone: boolean; here: boolean }> {
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

    const hasEveryone = mentions.has('everyone')
    const hasHere = mentions.has('here')
    mentions.delete('everyone')
    mentions.delete('here')

    if (mentions.size === 0 && !hasEveryone && !hasHere) {
      return { userIds: [], everyone: false, here: false }
    }

    const members = await this.prisma.serverMember.findMany({
      where: { serverId },
      include: {
        user: { select: { id: true, username: true, displayName: true } },
        role: { select: { permissions: true } }
      }
    })

    const sender = members.find((m) => m.userId === excludeUserId)
    const senderPerms = sender?.role?.permissions ?? 0n
    const MENTION_EVERYONE_FLAG = 1n << 7n
    const ADMINISTRATOR_FLAG = 1n << 11n
    const senderIsPrivileged = (senderPerms & ADMINISTRATOR_FLAG) !== 0n || (senderPerms & MENTION_EVERYONE_FLAG) !== 0n

    const resolvedEveryone = hasEveryone && senderIsPrivileged
    const resolvedHere = hasHere && senderIsPrivileged

    const onlineSet = onlineUserIds ? new Set(onlineUserIds) : null
    const userIdSet = new Set<string>()

    for (const m of members) {
      if (m.userId === excludeUserId) continue

      if (resolvedEveryone) {
        userIdSet.add(m.userId)
        continue
      }

      if (resolvedHere && onlineSet?.has(m.userId)) {
        userIdSet.add(m.userId)
        continue
      }

      if (
        mentions.has(m.user.username.toLowerCase()) ||
        (m.user.displayName && mentions.has(m.user.displayName.toLowerCase()))
      ) {
        userIdSet.add(m.userId)
      }
    }

    return { userIds: Array.from(userIdSet), everyone: resolvedEveryone, here: resolvedHere }
  }
}
