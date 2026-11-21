import { Injectable, NotFoundException } from '@nestjs/common'
import { messageNotificationUrl, type NotificationDismissal, type ReactionActivity, type ReactionActivityVersion } from '@chat/shared'
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
export type NotificationClearPayload = { userId: string } & NotificationDismissal

const SERVER_NOTICE_KINDS = [
  InAppNotificationKind.server_event, InAppNotificationKind.announcement, InAppNotificationKind.moderation,
  InAppNotificationKind.role_changed, InAppNotificationKind.level_up
]

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

  private emitClear(userId: string, urls: string[] | null, through?: Date, includeThreads = false) {
    const payload: NotificationClearPayload = {
      userId, urls, ...(through && { throughAt: through.toISOString() }), ...(includeThreads && { includeThreads })
    }
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
    const messageKind = ['mention', 'reply', 'thread_reply', 'channel_message', 'dm_message'].includes(input.kind)
    // A notification write may arrive after its message has already been read.
    const initialRead = messageKind ? Prisma.sql`
      CASE WHEN EXISTS (
        SELECT 1 FROM messages m
        LEFT JOIN inbox_thread_read_states t ON t.user_id = recipients.user_id AND t.thread_parent_id = m.thread_parent_id
        LEFT JOIN channel_read_states c ON c.user_id = recipients.user_id AND c.channel_id = m.channel_id
        LEFT JOIN dm_read_states d ON d.user_id = recipients.user_id AND d.conversation_id = m.direct_conversation_id
        WHERE m.id = ${payload}::jsonb->>'messageId'
          AND m.created_at <= COALESCE(t.last_read_at, c.last_read_at, d.last_read_at)
      ) THEN ${new Date()}::timestamp ELSE NULL END` : Prisma.sql`NULL::timestamp`
    const keepNewerUnreadTarget = Prisma.sql`
      notification.read_at IS NULL AND EXISTS (
        SELECT 1 FROM messages current_msg, messages incoming_msg
        WHERE current_msg.id = notification.payload->>'messageId' AND incoming_msg.id = EXCLUDED.payload->>'messageId'
          AND (current_msg.created_at, current_msg.id) > (incoming_msg.created_at, incoming_msg.id)
      )
    `
    const updateGuard = input.countMode
      ? Prisma.sql`WHERE NOT (EXCLUDED.read_at IS NOT NULL AND ${keepNewerUnreadTarget})`
      : Prisma.empty
    const updatedPayload = input.countMode
      ? Prisma.sql`(CASE WHEN ${keepNewerUnreadTarget} THEN notification.payload ELSE EXCLUDED.payload END) ||
        jsonb_build_object('count', (
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
            (id, user_id, kind, dedupe_key, payload, created_at, updated_at, read_at)
          SELECT gen_random_uuid()::text, user_id, ${input.kind}::"InAppNotificationKind",
            ${input.dedupeKey ?? null}, ${payload}::jsonb, ${now}, ${now}, ${initialRead}
          FROM unnest(${batch}::text[]) AS recipients(user_id)
          ORDER BY user_id
          ON CONFLICT (user_id, dedupe_key) DO UPDATE
          SET payload = ${updatedPayload},
            read_at = ${input.preserveRead ? Prisma.sql`COALESCE(notification.read_at, EXCLUDED.read_at)` : Prisma.sql`EXCLUDED.read_at`},
            updated_at = EXCLUDED.updated_at
          ${updateGuard}
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
      snippet?: string
      attachmentType?: string
      attachmentCount?: number
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
      ...(input.snippet ? { snippet: input.snippet } : {}),
      ...(input.attachmentType ? { attachmentType: input.attachmentType } : {}),
      ...(input.attachmentCount !== undefined ? { attachmentCount: input.attachmentCount } : {})
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
      snippet?: string
      attachmentType?: string
      attachmentCount?: number
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
  private channelScopedMatcher(channelId: string, includeThreads: boolean): Prisma.InAppNotificationWhereInput {
    const kinds = [InAppNotificationKind.mention, InAppNotificationKind.reply] as InAppNotificationKind[]
    if (includeThreads) kinds.push(InAppNotificationKind.thread_reply)
    return {
      kind: { in: kinds },
      payload: { path: ['channelId'], equals: channelId },
      ...(!includeThreads && { AND: { payload: { path: ['threadParentId'], equals: Prisma.AnyNull } } })
    }
  }

  private async refreshMentionCounts(userId: string, channelIds: string[]) {
    if (!channelIds.length) return
    await this.prisma.$executeRaw`
      UPDATE channel_read_states crs
      SET mention_count = (
        SELECT COUNT(*)::int FROM in_app_notifications n
        WHERE n.user_id = crs.user_id AND n.kind = 'mention' AND n.read_at IS NULL
          AND n.payload->>'channelId' = crs.channel_id
      )
      WHERE crs.user_id = ${userId} AND crs.channel_id = ANY(${channelIds}::text[])
    `
  }

  async markChannelRead(userId: string, channelId: string, through?: Date): Promise<void> {
    const res = await this.prisma.inAppNotification.updateMany({
      where: {
        userId,
        readAt: null,
        ...(through && { updatedAt: { lte: through } }),
        OR: [{ dedupeKey: `channel:${channelId}` }, this.channelScopedMatcher(channelId, false)]
      },
      data: { readAt: new Date() }
    })
    if (through) await this.refreshMentionCounts(userId, [channelId])
    if (res.count > 0 || through) this.emitUsers([userId])

    const ch = await this.prisma.channel
      .findUnique({ where: { id: channelId }, select: { serverId: true } })
      .catch(() => null)
    if (ch) this.emitClear(userId, [`/channels/${ch.serverId}/${channelId}`], through)
  }

  /** Mark all channel-scoped rows for an entire server as read for a single user. */
  async markServerChannelsRead(userId: string, channelIds: string[], serverId?: string, through?: Date): Promise<void> {
    if (channelIds.length === 0 && !serverId) return
    const matchers: Prisma.InAppNotificationWhereInput[] = channelIds.map((id) => this.channelScopedMatcher(id, true))
    if (channelIds.length) matchers.push({ dedupeKey: { in: channelIds.map((id) => `channel:${id}`) } })
    if (serverId) matchers.push({
      kind: { in: SERVER_NOTICE_KINDS }, payload: { path: ['serverId'], equals: serverId }
    })
    const res = await this.prisma.inAppNotification.updateMany({
      where: {
        userId,
        readAt: null,
        ...(through && { updatedAt: { lte: through } }),
        OR: matchers
      },
      data: { readAt: new Date() }
    })
    if (through) await this.refreshMentionCounts(userId, channelIds)
    if (res.count > 0 || through) this.emitUsers([userId])
    const urls = (await Promise.all(channelIds.map(async (id) => {
      const owner = serverId ?? (await this.prisma.channel.findUnique({ where: { id }, select: { serverId: true } }))?.serverId
      return owner ? `/channels/${owner}/${id}` : null
    }))).filter((url): url is string => url !== null)
    if (serverId) urls.push(`/channels/${serverId}`)
    if (urls.length > 0) this.emitClear(userId, urls, through, true)
  }

  /** Mark the coalesced DM row for a given conversation as read. */
  async markDmRead(userId: string, conversationId: string, through?: Date): Promise<void> {
    const res = await this.prisma.inAppNotification.updateMany({
      where: {
        userId,
        readAt: null,
        dedupeKey: `dm:${conversationId}`,
        ...(through && { updatedAt: { lte: through } })
      },
      data: { readAt: new Date() }
    })
    if (res.count > 0) this.emitUsers([userId])
    this.emitClear(userId, [`/channels/@me/${conversationId}`], through)
  }

  async recordDmMessages(
    recipientIds: string[],
    input: {
      conversationId: string
      messageId: string
      authorName: string
      snippet?: string
      attachmentType?: string
      attachmentCount?: number
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
      snippet?: string
      attachmentType?: string
      attachmentCount?: number
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
      where: { userId, readAt: null, kind: { not: InAppNotificationKind.reaction } }
    })
  }

  async unseenReactions(userId: string): Promise<ReactionActivity[]> {
    const rows = await this.prisma.inAppNotification.findMany({
      where: { userId, readAt: null, kind: InAppNotificationKind.reaction },
      select: { id: true, updatedAt: true, payload: true },
      orderBy: { id: 'asc' }
    })
    return rows.flatMap(({ id, updatedAt, payload }) => {
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return []
      const { messageId, emoji, isCustom } = payload
      if (typeof messageId !== 'string' || typeof emoji !== 'string') return []
      return [{ id, updatedAt: updatedAt.toISOString(), messageId, emoji, isCustom: isCustom === true }]
    })
  }

  async markReactionsSeen(userId: string, reactions: ReactionActivityVersion[]): Promise<{ ids: string[]; readAt: string }> {
    const readAt = new Date()
    const versions = reactions.map(({ id, updatedAt }) => Prisma.sql`(${id}, ${new Date(updatedAt)}::timestamp)`)
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      UPDATE in_app_notifications
      SET read_at = ${readAt}
      WHERE user_id = ${userId} AND kind = 'reaction' AND read_at IS NULL
        AND (id, updated_at) IN (${Prisma.join(versions)})
      RETURNING id
    `
    if (rows.length > 0) this.emitUsers([userId])
    return { ids: rows.map(({ id }) => id), readAt: readAt.toISOString() }
  }

  /** Server notices have no channel read state. Count all unread rows, rather
   * than only the current page of the notification bell. */
  async unreadServerCounts(userId: string): Promise<Record<string, number>> {
    const rows = await this.prisma.$queryRaw<{ serverId: string; count: bigint }[]>`
      SELECT payload->>'serverId' AS "serverId", COUNT(*) AS count
      FROM in_app_notifications
      WHERE user_id = ${userId} AND read_at IS NULL
        AND kind IN ('server_event', 'announcement', 'moderation', 'role_changed', 'level_up')
        AND jsonb_typeof(payload->'serverId') = 'string'
      GROUP BY payload->>'serverId'
    `
    return Object.fromEntries(rows.filter((row) => row.serverId).map((row) => [row.serverId, Number(row.count)]))
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
    if (['mention', 'reply', 'thread_reply', 'channel_message', 'dm_message'].includes(row.kind)) {
      const payload = this.toWire(row).payload
      if (typeof payload.messageId === 'string') {
        const path = typeof payload.conversationId === 'string' ? `/channels/@me/${payload.conversationId}`
          : typeof payload.serverId === 'string' && typeof payload.channelId === 'string'
            ? `/channels/${payload.serverId}/${payload.channelId}` : null
        if (path) this.emitClear(userId, [messageNotificationUrl(path, payload.messageId,
          typeof payload.threadParentId === 'string' ? payload.threadParentId : null)])
      }
    }
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
