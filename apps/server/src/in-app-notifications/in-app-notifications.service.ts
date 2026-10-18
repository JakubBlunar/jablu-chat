import { Injectable, NotFoundException } from '@nestjs/common'
import { InAppNotificationKind, Prisma } from '../prisma-client'
import { EventBusService } from '../events/event-bus.service'
import { PrismaService } from '../prisma/prisma.service'

export const IN_APP_NOTIFICATION_CAP_DEFAULT = 1000

/** Recipients per transaction for every notification kind. */
const RECORD_BATCH_SIZE = 100
export const IN_APP_NOTIFICATION_USERS_EVENT = 'in_app_notification:users' as const

/**
 * Carries the in-app URLs whose notifications are now stale, so the gateway can
 * tell the user's *other* devices to take the OS toast down. Reading a DM on
 * your phone should clear the desktop toast for it.
 *
 * A `urls` of `null` means "everything", used by mark-all-read.
 */
export const NOTIFICATION_CLEAR_EVENT = 'notification:clear' as const
export type NotificationClearPayload = { userId: string; urls: string[] | null }

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

  private emitClear(userId: string, urls: string[] | null) {
    const payload: NotificationClearPayload = { userId, urls }
    this.events.emit(NOTIFICATION_CLEAR_EVENT, payload)
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

  private async effectiveChannelPrefs(
    userIds: string[],
    channelId: string
  ): Promise<Map<string, string>> {
    const uniqueIds = [...new Set(userIds)]
    if (uniqueIds.length === 0) return new Map()
    const ch = await this.prisma.channel.findUnique({
      where: { id: channelId },
      select: { serverId: true }
    })
    if (!ch) return new Map(uniqueIds.map((id) => [id, 'none']))
    const [prefs, members] = await Promise.all([
      this.prisma.channelNotifPref.findMany({
        where: { channelId, userId: { in: uniqueIds } },
        select: { userId: true, level: true }
      }),
      this.prisma.serverMember.findMany({
        where: { serverId: ch.serverId, userId: { in: uniqueIds } },
        select: { userId: true, notifLevel: true }
      })
    ])
    const channelPrefs = new Map(prefs.map((pref) => [pref.userId, pref.level]))
    const serverPrefs = new Map(members.map((member) => [member.userId, member.notifLevel]))
    return new Map(uniqueIds.map((id) => [id, channelPrefs.get(id) ?? serverPrefs.get(id) ?? 'all']))
  }

  private async applyTtlAndCap(tx: Prisma.TransactionClient, userIds: string[]) {
    if (this.ttlMs > 0) {
      await tx.$executeRaw`
        DELETE FROM in_app_notifications
        WHERE user_id = ANY(${userIds}::text[])
          AND created_at < ${new Date(Date.now() - this.ttlMs)}
      `
    }
    await tx.$executeRaw`
      WITH overflowing AS (
        SELECT user_id, COUNT(*) - ${this.cap} AS excess
        FROM in_app_notifications
        WHERE user_id = ANY(${userIds}::text[])
        GROUP BY user_id
        HAVING COUNT(*) > ${this.cap}
      ), ranked AS (
        SELECT n.id, o.excess, ROW_NUMBER() OVER (
          PARTITION BY n.user_id
          ORDER BY (n.read_at IS NULL), n.read_at ASC NULLS LAST, n.created_at ASC, n.id
        ) AS removal_order
        FROM in_app_notifications n
        JOIN overflowing o ON o.user_id = n.user_id
      )
      DELETE FROM in_app_notifications
      WHERE id IN (SELECT id FROM ranked WHERE removal_order <= excess)
    `
  }

  private async writeNotifications(
    userIds: string[],
    input: {
      kind: InAppNotificationKind
      dedupeKey?: string
      payload: Prisma.InputJsonValue
      countMode?: 'unread' | 'all'
      preserveRead?: boolean
    }
  ): Promise<void> {
    const targets = [...new Set(userIds)]
    const payload = JSON.stringify(input.payload)
    const updatedPayload = input.countMode
      ? Prisma.sql`EXCLUDED.payload || jsonb_build_object('count', (
          CASE
            WHEN ${input.countMode === 'unread'} AND notification.read_at IS NOT NULL THEN 0
            WHEN jsonb_typeof(notification.payload->'count') = 'number'
              THEN (notification.payload->>'count')::numeric
            ELSE 0
          END
        ) + 1)`
      : Prisma.sql`EXCLUDED.payload`

    for (let i = 0; i < targets.length; i += RECORD_BATCH_SIZE) {
      const batch = targets.slice(i, i + RECORD_BATCH_SIZE)
      const now = new Date()
      await this.prisma.$transaction(async (tx) => {
        // Different notification keys must still share one per-account retention boundary.
        await tx.$queryRaw`
          SELECT id FROM users WHERE id = ANY(${batch}::text[]) ORDER BY id FOR UPDATE
        `
        // A consistent recipient order also gives overlapping fan-outs the same lock order.
        await tx.$executeRaw`
          INSERT INTO in_app_notifications AS notification
            (id, user_id, kind, dedupe_key, payload, created_at, updated_at)
          SELECT gen_random_uuid()::text, user_id, ${input.kind}::"InAppNotificationKind",
            ${input.dedupeKey ?? null}, ${payload}::jsonb, ${now}, ${now}
          FROM unnest(${batch}::text[]) AS recipients(user_id)
          ORDER BY user_id
          ON CONFLICT (user_id, dedupe_key) DO UPDATE
          SET payload = ${updatedPayload},
            read_at = ${input.preserveRead ? Prisma.sql`notification.read_at` : Prisma.sql`NULL`},
            updated_at = EXCLUDED.updated_at
        `
        await this.applyTtlAndCap(tx, batch)
      })
      this.emitUsers(batch)
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
      threadParentId?: string | null
      authorName: string
      snippet: string
    }
  ): Promise<void> {
    const prefs = await this.effectiveChannelPrefs(userIds, input.channelId)
    const targets = [...prefs.keys()].filter((id) => prefs.get(id) !== 'none')
    if (targets.length === 0) return

    const dedupeKey = `mention:${input.messageId}`
    const payload: Prisma.InputJsonValue = {
      serverId: input.serverId,
      channelId: input.channelId,
      channelName: input.channelName,
      messageId: input.messageId,
      ...(input.threadParentId ? { threadParentId: input.threadParentId } : {}),
      authorName: input.authorName,
      snippet: input.snippet
    }

    await this.writeNotifications(targets, {
      kind: InAppNotificationKind.mention,
      dedupeKey,
      payload,
      preserveRead: true
    })
  }

  /**
   * Coalesced "new message in channel" row, one per (userId, channelId).
   * Used for non-mention activity in channels where the user has notifLevel === 'all'.
   * Skips users whose effective channel pref is 'none' or 'mentions' (mention rows are
   * handled separately by recordMentions).
   */
  async recordChannelMessage(
    recipientIds: string[],
    input: {
      serverId: string
      channelId: string
      channelName: string
      messageId: string
      authorName: string
      snippet: string
    }
  ): Promise<void> {
    if (recipientIds.length === 0) return

    const prefs = await this.effectiveChannelPrefs(recipientIds, input.channelId)
    const targets = [...prefs.keys()].filter((id) => prefs.get(id) === 'all')
    if (targets.length === 0) return

    const dedupeKey = `channel:${input.channelId}`

    await this.writeNotifications(targets, {
      kind: InAppNotificationKind.channel_message,
      dedupeKey,
      payload: { ...input, count: 1 },
      countMode: 'unread'
    })
  }

  /**
   * Kinds that live inside a channel and are therefore cleared by opening it.
   * Everything else (moderation, role_changed, level_up, announcement,
   * server_event, friend_*) has no channel to open and clears on click or on
   * mark-all-read instead.
   */
  private channelScopedMatchers(channelId: string): Prisma.InAppNotificationWhereInput[] {
    return [
      InAppNotificationKind.mention,
      InAppNotificationKind.thread_reply,
      InAppNotificationKind.reply
    ].map((kind) => ({
      kind,
      payload: { path: ['channelId'], equals: channelId }
    }))
  }

  /** Mark coalesced channel/thread/mention/reply rows for a given channel as read. */
  async markChannelRead(userId: string, channelId: string): Promise<void> {
    const res = await this.prisma.inAppNotification.updateMany({
      where: {
        userId,
        readAt: null,
        OR: [{ dedupeKey: `channel:${channelId}` }, ...this.channelScopedMatchers(channelId)]
      },
      data: { readAt: new Date() }
    })
    if (res.count > 0) this.emitUsers([userId])

    const ch = await this.prisma.channel
      .findUnique({ where: { id: channelId }, select: { serverId: true } })
      .catch(() => null)
    if (ch) this.emitClear(userId, [`/channels/${ch.serverId}/${channelId}`])
  }

  /** Mark all channel-scoped rows for an entire server as read for a single user. */
  async markServerChannelsRead(userId: string, channelIds: string[]): Promise<void> {
    if (channelIds.length === 0) return
    const channelDedupeKeys = channelIds.map((id) => `channel:${id}`)
    const dedupeRes = await this.prisma.inAppNotification.updateMany({
      where: {
        userId,
        readAt: null,
        dedupeKey: { in: channelDedupeKeys }
      },
      data: { readAt: new Date() }
    })
    let crossKindAffected = 0
    for (const channelId of channelIds) {
      const res = await this.prisma.inAppNotification.updateMany({
        where: {
          userId,
          readAt: null,
          OR: this.channelScopedMatchers(channelId)
        },
        data: { readAt: new Date() }
      })
      crossKindAffected += res.count
    }
    if (dedupeRes.count + crossKindAffected > 0) this.emitUsers([userId])
  }

  /** Mark the coalesced DM row for a given conversation as read. */
  async markDmRead(userId: string, conversationId: string): Promise<void> {
    const res = await this.prisma.inAppNotification.updateMany({
      where: {
        userId,
        readAt: null,
        dedupeKey: `dm:${conversationId}`
      },
      data: { readAt: new Date() }
    })
    if (res.count > 0) this.emitUsers([userId])
    this.emitClear(userId, [`/channels/@me/${conversationId}`])
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
    await this.writeNotifications(recipientIds, {
      kind: InAppNotificationKind.dm_message,
      dedupeKey: `dm:${input.conversationId}`,
      payload: { ...input, count: 1 },
      countMode: 'unread'
    })
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
    const prefs = await this.effectiveChannelPrefs(participantIds, input.channelId)
    const targets = [...prefs.keys()].filter((id) => prefs.get(id) !== 'none')
    if (targets.length === 0) return

    await this.writeNotifications(targets, {
      kind: InAppNotificationKind.thread_reply,
      dedupeKey: `thread:${input.threadParentId}`,
      payload: { ...input, count: 1 },
      countMode: 'all'
    })
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
    // Like every other mutating method here: without this the badge on the user's
    // other devices stays stale until a full reload.
    this.emitUsers([userId])
    return this.toWire(updated)
  }

  async markAllRead(userId: string): Promise<{ updated: number }> {
    const res = await this.prisma.inAppNotification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() }
    })
    if (res.count > 0) this.emitUsers([userId])
    this.emitClear(userId, null)
    return { updated: res.count }
  }

  /**
   * Writes a one-shot row for the kinds that carry no coalescing of their own —
   * moderation, role changes, level ups, announcements, events, friend accepts.
   *
   * `dedupeKey` makes the write idempotent (a retried job updates rather than
   * duplicates); omit it for rows that should stack, such as repeated level ups.
   */
  async record(
    userIds: string[],
    input: {
      kind: InAppNotificationKind
      dedupeKey?: string
      payload: Record<string, unknown>
    }
  ): Promise<void> {
    await this.writeNotifications(userIds, {
      ...input,
      dedupeKey: input.dedupeKey || undefined,
      payload: input.payload as Prisma.InputJsonValue
    })
  }
}
