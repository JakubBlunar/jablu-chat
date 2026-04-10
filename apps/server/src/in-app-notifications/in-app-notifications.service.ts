import { Injectable, NotFoundException } from '@nestjs/common'
import { InAppNotificationKind, Prisma } from '../prisma-client'
import { EventBusService } from '../events/event-bus.service'
import { PrismaService } from '../prisma/prisma.service'

export const IN_APP_NOTIFICATION_CAP_DEFAULT = 500
export const IN_APP_NOTIFICATION_USERS_EVENT = 'in_app_notification:users' as const

export type InAppNotificationWire = {
  id: string
  kind: InAppNotificationKind
  payload: Record<string, unknown>
  readAt: string | null
  createdAt: string
  updatedAt: string
}

function clampCap(raw: string | undefined): number {
  const n = parseInt(raw ?? '', 10)
  if (Number.isNaN(n)) return IN_APP_NOTIFICATION_CAP_DEFAULT
  return Math.min(Math.max(n, 50), 10_000)
}

function ttlMsFromEnv(raw: string | undefined): number {
  const days = parseInt(raw ?? '0', 10)
  if (Number.isNaN(days) || days <= 0) return 0
  return days * 86_400_000
}

@Injectable()
export class InAppNotificationsService {
  private readonly cap: number
  private readonly ttlMs: number

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventBusService
  ) {
    this.cap = clampCap(process.env.IN_APP_NOTIFICATION_CAP)
    this.ttlMs = ttlMsFromEnv(process.env.IN_APP_NOTIFICATION_TTL_DAYS)
  }

  private emitUsers(userIds: string[]) {
    const u = [...new Set(userIds)]
    if (u.length === 0) return
    this.events.emit(IN_APP_NOTIFICATION_USERS_EVENT, { userIds: u })
  }

  private toWire(row: {
    id: string
    kind: InAppNotificationKind
    payload: unknown
    readAt: Date | null
    createdAt: Date
    updatedAt: Date
  }): InAppNotificationWire {
    return {
      id: row.id,
      kind: row.kind,
      payload: (row.payload ?? {}) as Record<string, unknown>,
      readAt: row.readAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString()
    }
  }

  private async effectiveChannelPref(
    userId: string,
    channelId: string
  ): Promise<'all' | 'mentions' | 'none'> {
    const ch = await this.prisma.channel.findUnique({
      where: { id: channelId },
      select: { serverId: true }
    })
    if (!ch) return 'none'
    const [pref, member] = await Promise.all([
      this.prisma.channelNotifPref.findUnique({
        where: { userId_channelId: { userId, channelId } }
      }),
      this.prisma.serverMember.findUnique({
        where: { userId_serverId: { userId, serverId: ch.serverId } }
      })
    ])
    return (pref?.level ?? member?.notifLevel ?? 'all') as 'all' | 'mentions' | 'none'
  }

  private async applyTtlAndCap(tx: Prisma.TransactionClient, userId: string) {
    if (this.ttlMs > 0) {
      await tx.inAppNotification.deleteMany({
        where: { userId, createdAt: { lt: new Date(Date.now() - this.ttlMs) } }
      })
    }
    let count = await tx.inAppNotification.count({ where: { userId } })
    let excess = count - this.cap
    while (excess > 0) {
      const readRows = await tx.inAppNotification.findMany({
        where: { userId, readAt: { not: null } },
        orderBy: { readAt: 'asc' },
        select: { id: true },
        take: excess
      })
      let ids = readRows.map((r) => r.id)
      const need = excess - ids.length
      if (need > 0) {
        const unread = await tx.inAppNotification.findMany({
          where: { userId, readAt: null },
          orderBy: { createdAt: 'asc' },
          select: { id: true },
          take: need
        })
        ids = [...ids, ...unread.map((r) => r.id)]
      }
      if (ids.length === 0) break
      await tx.inAppNotification.deleteMany({ where: { id: { in: ids } } })
      count = await tx.inAppNotification.count({ where: { userId } })
      excess = count - this.cap
      if (ids.length < excess) break
    }
  }

  /** @mentioned users (already permission-filtered). Skips users with channel muted. */
  async recordMentions(
    userIds: string[],
    input: {
      serverId: string
      channelId: string
      channelName: string
      messageId: string
      authorName: string
      snippet: string
    }
  ): Promise<void> {
    const targets: string[] = []
    for (const uid of userIds) {
      const pref = await this.effectiveChannelPref(uid, input.channelId)
      if (pref === 'none') continue
      targets.push(uid)
    }
    if (targets.length === 0) return

    const dedupeKey = `mention:${input.messageId}`
    const payload: Prisma.InputJsonValue = {
      serverId: input.serverId,
      channelId: input.channelId,
      channelName: input.channelName,
      messageId: input.messageId,
      authorName: input.authorName,
      snippet: input.snippet
    }

    await this.prisma.$transaction(async (tx) => {
      for (const userId of targets) {
        await tx.inAppNotification.upsert({
          where: { userId_dedupeKey: { userId, dedupeKey } },
          create: {
            userId,
            kind: InAppNotificationKind.mention,
            dedupeKey,
            payload
          },
          update: { payload }
        })
        await this.applyTtlAndCap(tx, userId)
      }
    })

    this.emitUsers(targets)
  }

  async recordDmMessages(
    recipientIds: string[],
    input: {
      conversationId: string
      messageId: string
      authorName: string
      snippet: string
    }
  ): Promise<void> {
    if (recipientIds.length === 0) return
    const dedupeKey = `dm:${input.conversationId}`

    await this.prisma.$transaction(async (tx) => {
      for (const userId of recipientIds) {
        const existing = await tx.inAppNotification.findUnique({
          where: { userId_dedupeKey: { userId, dedupeKey } }
        })
        const prev = (existing?.payload as Record<string, unknown> | null) ?? {}
        const prevCount = typeof prev.count === 'number' ? prev.count : 0
        const nextPayload: Prisma.InputJsonValue = {
          conversationId: input.conversationId,
          messageId: input.messageId,
          authorName: input.authorName,
          snippet: input.snippet,
          count: prevCount + 1
        }
        await tx.inAppNotification.upsert({
          where: { userId_dedupeKey: { userId, dedupeKey } },
          create: {
            userId,
            kind: InAppNotificationKind.dm_message,
            dedupeKey,
            payload: {
              conversationId: input.conversationId,
              messageId: input.messageId,
              authorName: input.authorName,
              snippet: input.snippet,
              count: 1
            }
          },
          update: { payload: nextPayload, readAt: null }
        })
        await this.applyTtlAndCap(tx, userId)
      }
    })

    this.emitUsers(recipientIds)
  }

  /** Thread participants (excludes sender). Skips users with channel muted. */
  async recordThreadActivity(
    participantIds: string[],
    input: {
      serverId: string
      channelId: string
      channelName: string
      threadParentId: string
      messageId: string
      authorName: string
      snippet: string
    }
  ): Promise<void> {
    const targets: string[] = []
    for (const uid of participantIds) {
      const pref = await this.effectiveChannelPref(uid, input.channelId)
      if (pref === 'none') continue
      targets.push(uid)
    }
    if (targets.length === 0) return

    const dedupeKey = `thread:${input.threadParentId}`

    await this.prisma.$transaction(async (tx) => {
      for (const userId of targets) {
        const existing = await tx.inAppNotification.findUnique({
          where: { userId_dedupeKey: { userId, dedupeKey } }
        })
        const prev = (existing?.payload as Record<string, unknown> | null) ?? {}
        const prevCount = typeof prev.count === 'number' ? prev.count : 0
        const nextPayload: Prisma.InputJsonValue = {
          serverId: input.serverId,
          channelId: input.channelId,
          channelName: input.channelName,
          threadParentId: input.threadParentId,
          messageId: input.messageId,
          authorName: input.authorName,
          snippet: input.snippet,
          count: prevCount + 1
        }
        await tx.inAppNotification.upsert({
          where: { userId_dedupeKey: { userId, dedupeKey } },
          create: {
            userId,
            kind: InAppNotificationKind.thread_reply,
            dedupeKey,
            payload: {
              serverId: input.serverId,
              channelId: input.channelId,
              channelName: input.channelName,
              threadParentId: input.threadParentId,
              messageId: input.messageId,
              authorName: input.authorName,
              snippet: input.snippet,
              count: 1
            }
          },
          update: { payload: nextPayload, readAt: null }
        })
        await this.applyTtlAndCap(tx, userId)
      }
    })

    this.emitUsers(targets)
  }

  async recordFriendRequest(
    addresseeId: string,
    input: { friendshipId: string; requesterId: string; requesterName: string }
  ): Promise<void> {
    const dedupeKey = `friend:${input.friendshipId}`
    const payload: Prisma.InputJsonValue = {
      friendshipId: input.friendshipId,
      requesterId: input.requesterId,
      requesterName: input.requesterName
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.inAppNotification.upsert({
        where: { userId_dedupeKey: { userId: addresseeId, dedupeKey } },
        create: {
          userId: addresseeId,
          kind: InAppNotificationKind.friend_request,
          dedupeKey,
          payload
        },
        update: { payload, readAt: null }
      })
      await this.applyTtlAndCap(tx, addresseeId)
    })

    this.emitUsers([addresseeId])
  }

  async list(userId: string, limit = 40, cursor?: string) {
    const take = Math.min(Math.max(limit, 1), 100)
    const afterRow =
      cursor ?
        await this.prisma.inAppNotification.findFirst({
          where: { id: cursor, userId }
        })
      : null

    const rows = await this.prisma.inAppNotification.findMany({
      where: {
        userId,
        ...(afterRow ?
          {
            OR: [
              { updatedAt: { lt: afterRow.updatedAt } },
              { AND: [{ updatedAt: afterRow.updatedAt }, { id: { lt: afterRow.id } }] }
            ]
          }
        : {})
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: take + 1
    })
    const hasMore = rows.length > take
    const page = hasMore ? rows.slice(0, take) : rows
    const nextCursor = hasMore ? page[page.length - 1]?.id : undefined
    return {
      items: page.map((r) => this.toWire(r)),
      nextCursor
    }
  }

  /** Users following a thread (parent author + distinct reply authors), excluding sender. */
  async resolveThreadParticipantUserIds(threadParentId: string, senderId: string): Promise<string[]> {
    const [parent, replies] = await Promise.all([
      this.prisma.message.findUnique({
        where: { id: threadParentId },
        select: { authorId: true }
      }),
      this.prisma.message.findMany({
        where: { threadParentId, deleted: false },
        select: { authorId: true },
        distinct: ['authorId']
      })
    ])
    const set = new Set<string>()
    if (parent?.authorId) set.add(parent.authorId)
    for (const r of replies) {
      if (r.authorId) set.add(r.authorId)
    }
    set.delete(senderId)
    return [...set]
  }

  async unreadCount(userId: string): Promise<number> {
    return this.prisma.inAppNotification.count({
      where: { userId, readAt: null }
    })
  }

  async markRead(userId: string, id: string): Promise<InAppNotificationWire> {
    const row = await this.prisma.inAppNotification.findFirst({
      where: { id, userId }
    })
    if (!row) throw new NotFoundException('Notification not found')
    if (row.readAt) return this.toWire(row)
    const updated = await this.prisma.inAppNotification.update({
      where: { id },
      data: { readAt: new Date() }
    })
    return this.toWire(updated)
  }

  async markAllRead(userId: string): Promise<{ updated: number }> {
    const res = await this.prisma.inAppNotification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() }
    })
    return { updated: res.count }
  }
}
