import { Injectable } from '@nestjs/common'
import { hasPermission, Permission } from '@chat/shared'
import { InAppNotificationsService } from '../in-app-notifications/in-app-notifications.service'
import { PrismaService } from '../prisma/prisma.service'
import { RolesService } from '../roles/roles.service'

@Injectable()
export class ReadStateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly roles: RolesService,
    private readonly inApp: InAppNotificationsService,
  ) {}

  async getAllForUser(userId: string) {
    const [channelRows, dmRows] = await Promise.all([
      this.prisma.$queryRaw<
        {
          channel_id: string
          last_read_at: Date
          mention_count: number
          server_id: string
          unread_count: bigint
          first_unread_message_id: string | null
        }[]
      >`
        SELECT c.id AS channel_id,
          COALESCE(crs.last_read_at, sm.joined_at) AS last_read_at,
          COALESCE(crs.mention_count, 0) AS mention_count, c.server_id,
          (SELECT COUNT(*) FROM (
            SELECT 1 FROM messages m
            WHERE m.channel_id = c.id
              AND m.created_at > COALESCE(crs.last_read_at, sm.joined_at)
              AND m.deleted = false
              AND m.author_id != ${userId}
              AND m.thread_parent_id IS NULL
            LIMIT 100
          ) sub) AS unread_count,
          (SELECT m.id FROM messages m
            WHERE m.channel_id = c.id
              AND m.created_at > COALESCE(crs.last_read_at, sm.joined_at)
              AND m.deleted = false
              AND m.author_id != ${userId}
              AND m.thread_parent_id IS NULL
            ORDER BY m.created_at ASC
            LIMIT 1
          ) AS first_unread_message_id
        FROM channels c
        JOIN server_members sm ON sm.server_id = c.server_id AND sm.user_id = ${userId}
        LEFT JOIN channel_read_states crs ON crs.channel_id = c.id AND crs.user_id = ${userId}
        WHERE c.type IN ('text', 'forum')
      `,
      this.prisma.$queryRaw<
        {
          conversation_id: string
          marked_unread: boolean
          last_read_at: Date
          mention_count: number
          unread_count: bigint
          first_unread_message_id: string | null
        }[]
      >`
        SELECT dcm.conversation_id, dcm.marked_unread,
          COALESCE(drs.last_read_at, dcm.joined_at) AS last_read_at,
          COALESCE(drs.mention_count, 0) AS mention_count,
          (SELECT COUNT(*) FROM (
            SELECT 1 FROM messages m
            WHERE m.direct_conversation_id = dcm.conversation_id
              AND m.created_at > COALESCE(drs.last_read_at, dcm.joined_at)
              AND m.deleted = false
              AND m.author_id != ${userId}
            LIMIT 100
          ) sub) AS unread_count,
          (SELECT m.id FROM messages m
            WHERE m.direct_conversation_id = dcm.conversation_id
              AND m.created_at > COALESCE(drs.last_read_at, dcm.joined_at)
              AND m.deleted = false
              AND m.author_id != ${userId}
            ORDER BY m.created_at ASC
            LIMIT 1
          ) AS first_unread_message_id
        FROM direct_conversation_members dcm
        LEFT JOIN dm_read_states drs
          ON drs.conversation_id = dcm.conversation_id AND drs.user_id = ${userId}
        WHERE dcm.user_id = ${userId}
      `
    ])

    const allChannels = channelRows.map((r) => ({
      channelId: r.channel_id,
      lastReadAt: r.last_read_at.toISOString(),
      mentionCount: Number(r.mention_count),
      serverId: r.server_id,
      unreadCount: Number(r.unread_count),
      firstUnreadMessageId: r.first_unread_message_id
    }))

    const serverIds = [...new Set(allChannels.map((c) => c.serverId))]
    const visibleByServer = await this.roles.getVisibleChannelIdsForServers(userId, serverIds)
    const visibleIds = new Set(Array.from(visibleByServer.values()).flat())
    const channels = allChannels.filter((c) => visibleIds.has(c.channelId))

    const dms = dmRows.map((r) => ({
      conversationId: r.conversation_id,
      lastReadAt: r.last_read_at.toISOString(),
      mentionCount: Number(r.mention_count),
      unreadCount: Math.max(Number(r.unread_count), r.marked_unread ? 1 : 0),
      firstUnreadMessageId: r.first_unread_message_id
    }))

    return { channels, dms }
  }

  async ackServer(userId: string, serverId: string) {
    const permMap = await this.roles.getAllChannelPermissions(serverId, userId)
    const visibleIds = Object.entries(permMap)
      .filter(([, perms]) => hasPermission(perms, Permission.VIEW_CHANNEL))
      .map(([chId]) => chId)
    if (visibleIds.length === 0) return
    const now = new Date()
    await this.prisma.$executeRaw`
      INSERT INTO channel_read_states (user_id, channel_id, last_read_at, mention_count)
      SELECT ${userId}, unnest(${visibleIds}::text[]), ${now}, 0
      ON CONFLICT (user_id, channel_id) DO UPDATE
        SET last_read_at = EXCLUDED.last_read_at, mention_count = 0
    `
    await this.inApp.markServerChannelsRead(userId, visibleIds).catch(() => {})
  }

  async ackChannel(userId: string, channelId: string) {
    await this.prisma.channelReadState.upsert({
      where: { userId_channelId: { userId, channelId } },
      update: { lastReadAt: new Date(), mentionCount: 0 },
      create: { userId, channelId, lastReadAt: new Date(), mentionCount: 0 }
    })
    await this.inApp.markChannelRead(userId, channelId).catch(() => {})
  }

  async ackDm(userId: string, conversationId: string) {
    await this.prisma.directConversationMember.updateMany({
      where: { userId, conversationId },
      data: { markedUnread: false }
    })
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
    await this.inApp.markDmRead(userId, conversationId).catch(() => {})
  }

  async markDmUnread(userId: string, conversationId: string) {
    await this.prisma.directConversationMember.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { markedUnread: true, closedAt: null }
    })
  }

  async incrementMention(channelId: string, userIds: string[]) {
    if (userIds.length === 0) return
    const uniqueIds = [...new Set(userIds)]
    await this.prisma.$executeRaw`
      INSERT INTO channel_read_states (user_id, channel_id, last_read_at, mention_count)
      SELECT user_id, ${channelId}, ${new Date(0)}, 1
      FROM unnest(${uniqueIds}::text[]) AS recipients(user_id)
      ORDER BY user_id
      ON CONFLICT (user_id, channel_id) DO UPDATE
        SET mention_count = channel_read_states.mention_count + 1
    `
  }

  async incrementDmMention(conversationId: string, userIds: string[]) {
    if (userIds.length === 0) return
    const uniqueIds = [...new Set(userIds)]
    await this.prisma.$executeRaw`
      INSERT INTO dm_read_states (user_id, conversation_id, last_read_at, mention_count)
      SELECT user_id, ${conversationId}, ${new Date(0)}, 1
      FROM unnest(${uniqueIds}::text[]) AS recipients(user_id)
      ORDER BY user_id
      ON CONFLICT (user_id, conversation_id) DO UPDATE
        SET mention_count = dm_read_states.mention_count + 1
    `
  }

  /**
   * Parse @mentions from message content and return matching user IDs
   * that are members of the given server.
   *
   * Supports: @username, @DisplayName (single word), @"Display Name" (quoted, multi-word),
   * @everyone (all members), @here (online members only),
   * @RoleName / @"Role Name" (all members with that role; excludes the default @everyone role).
   * @everyone, @here, and @role are restricted to users with Mention Everyone or Administrator.
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
      mentions.add(match[1].trim().toLowerCase())
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
        roles: {
          include: {
            role: { select: { id: true, name: true, permissions: true, isDefault: true } }
          }
        }
      }
    })

    const sender = members.find((m) => m.userId === excludeUserId)
    const senderPerms = sender?.roles?.reduce((acc, mr) => acc | mr.role.permissions, 0n) ?? 0n
    const MENTION_EVERYONE_FLAG = 1n << 7n
    const ADMINISTRATOR_FLAG = 1n << 11n
    const senderIsPrivileged = (senderPerms & ADMINISTRATOR_FLAG) !== 0n || (senderPerms & MENTION_EVERYONE_FLAG) !== 0n

    const resolvedEveryone = hasEveryone && senderIsPrivileged
    const resolvedHere = hasHere && senderIsPrivileged

    const onlineSet = onlineUserIds ? new Set(onlineUserIds) : null
    const userIdSet = new Set<string>()
    const consumedTokens = new Set<string>()

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

      const un = m.user.username.toLowerCase()
      const dn = m.user.displayName?.trim().toLowerCase()
      if (mentions.has(un)) {
        userIdSet.add(m.userId)
        consumedTokens.add(un)
      }
      if (dn && mentions.has(dn)) {
        userIdSet.add(m.userId)
        consumedTokens.add(dn)
      }
    }

    if (senderIsPrivileged && !resolvedEveryone && !resolvedHere) {
      for (const token of mentions) {
        if (consumedTokens.has(token)) continue
        for (const m of members) {
          if (m.userId === excludeUserId) continue
          const inRole = m.roles.some(
            (mr) => !mr.role.isDefault && mr.role.name.toLowerCase() === token
          )
          if (inRole) {
            userIdSet.add(m.userId)
          }
        }
      }
    }

    return { userIds: Array.from(userIdSet), everyone: resolvedEveryone, here: resolvedHere }
  }
}
