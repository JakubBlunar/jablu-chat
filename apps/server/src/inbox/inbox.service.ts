import {
  BadRequestException, ConflictException, GoneException, Injectable, NotFoundException
} from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import type { InboxGroup, InboxHighlight, InboxPage, InboxSession, InboxTarget, InboxView } from '@chat/shared'
import { Prisma } from '../prisma-client'
import { PrismaService } from '../prisma/prisma.service'
import { RolesService } from '../roles/roles.service'
import { EventBusService } from '../events/event-bus.service'
import { IN_APP_NOTIFICATION_USERS_EVENT } from '../in-app-notifications/in-app-notifications.service'
import { groupKey, integer, isoDate, object, storedSession, target, uuid, view } from './inbox.validation'
import { indexInboxPage } from './inbox-page-index'

type Context = {
  mode: 'channel' | 'dm'
  id: string
  serverId: string | null
  name: string
  serverName: string | null
  muted: boolean
  lastReadAt: Date
}
const messageSelect = {
  id: true, channelId: true, directConversationId: true, threadParentId: true,
  deleted: true, authorId: true, content: true, title: true, createdAt: true, webhookName: true,
  author: { select: { displayName: true, username: true } },
  replyTo: { select: { authorId: true } },
  threadParent: { select: { id: true, channelId: true, deleted: true, title: true } }
} satisfies Prisma.MessageSelect
type MessageRow = Prisma.MessageGetPayload<{ select: typeof messageSelect }>
type UnreadRow = {
  mode: 'channel' | 'dm'; contextId: string; unreadCount: bigint
  latestAt: Date; ids: string[]
}
type Database = Prisma.TransactionClient
export const INBOX_LATER_CAP = 1000

@Injectable()
export class InboxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly roles: RolesService,
    private readonly events: EventBusService
  ) {}

  private bump(userId: string) {
    this.events.emit(IN_APP_NOTIFICATION_USERS_EVENT, { userIds: [userId] })
    this.events.emit('dm:preferences-read-state', { userId })
  }

  private unavailable(session?: InboxSession) {
    return new GoneException({
      code: 'INBOX_TARGET_UNAVAILABLE', message: 'Inbox target is unavailable',
      ...(session ? { id: session.id, revision: session.revision, index: session.index } : {})
    })
  }

  private async contexts(userId: string, targets?: InboxTarget[]): Promise<Map<string, Context>> {
    const [channels, dms] = await Promise.all([
      this.prisma.channel.findMany({
        where: {
          type: { in: ['text', 'forum'] }, server: { members: { some: { userId } } },
          ...(targets ? { id: { in: targets.filter((t) => t.mode === 'channel').map((t) => t.contextId) } } : {})
        },
        select: {
          id: true, name: true, serverId: true,
          server: { select: {
            name: true, members: { where: { userId }, select: { joinedAt: true, notifLevel: true } }
          } },
          notifPreferences: { where: { userId }, select: { level: true } },
          readStates: { where: { userId }, select: { lastReadAt: true } }
        }
      }),
      this.prisma.directConversation.findMany({
        where: {
          members: { some: { userId } },
          ...(targets ? { id: { in: targets.filter((t) => t.mode === 'dm').map((t) => t.contextId) } } : {})
        },
        select: {
          id: true, groupName: true,
          members: { select: {
            userId: true, muted: true, joinedAt: true,
            user: { select: { username: true, displayName: true } }
          } },
          readStates: { where: { userId }, select: { lastReadAt: true } }
        }
      })
    ])
    const visible = await this.roles.getVisibleChannelIdsForServers(
      userId, [...new Set(channels.map((c) => c.serverId))]
    )
    const ids = new Set([...visible.values()].flat())
    const result = new Map<string, Context>()
    for (const ch of channels) {
      const member = ch.server.members[0]
      if (!ids.has(ch.id) || !member) continue
      result.set(`channel:${ch.id}`, {
        mode: 'channel', id: ch.id, serverId: ch.serverId, name: ch.name,
        serverName: ch.server.name,
        muted: (ch.notifPreferences[0]?.level ?? member.notifLevel) === 'none',
        lastReadAt: ch.readStates[0]?.lastReadAt ?? member.joinedAt
      })
    }
    for (const dm of dms) {
      const member = dm.members.find((m) => m.userId === userId)
      if (!member) continue
      result.set(`dm:${dm.id}`, {
        mode: 'dm', id: dm.id, serverId: null, serverName: null,
        name: dm.groupName || dm.members.filter((m) => m.userId !== userId)
          .map((m) => m.user.displayName || m.user.username).join(', ') ||
          member.user.displayName || member.user.username,
        muted: member.muted, lastReadAt: dm.readStates[0]?.lastReadAt ?? member.joinedAt
      })
    }
    return result
  }

  private async messages(ids: string[]): Promise<Map<string, MessageRow>> {
    const unique = [...new Set(ids)]
    if (unique.length === 0) return new Map()
    const rows = await this.prisma.message.findMany({
      where: { id: { in: unique } }, select: messageSelect
    })
    return new Map(rows.map((m) => [m.id, m]))
  }

  private available(t: InboxTarget, contexts: Map<string, Context>, messages: Map<string, MessageRow>) {
    const ctx = contexts.get(`${t.mode}:${t.contextId}`)
    if (!ctx || ctx.serverId !== t.serverId) return false
    if (t.threadParentId) {
      const parent = messages.get(t.threadParentId)
      if (t.mode !== 'channel' || !parent || parent.deleted || parent.threadParentId ||
        parent.channelId !== t.contextId) return false
    }
    if (t.messageId) {
      const message = messages.get(t.messageId)
      if (!message || message.deleted ||
        (t.mode === 'channel' ? message.channelId !== t.contextId : message.directConversationId !== t.contextId) ||
        (message.id !== t.threadParentId && message.threadParentId !== t.threadParentId)) return false
    }
    return true
  }

  private async requireTarget(userId: string, t: InboxTarget, session?: InboxSession) {
    const [contexts, messages] = await Promise.all([
      this.contexts(userId, [t]), this.messages([t.messageId, t.threadParentId].filter((id): id is string => !!id))
    ])
    if (!this.available(t, contexts, messages)) {
      throw this.unavailable(session)
    }
  }

  private highlight(message: MessageRow, kind: InboxHighlight['kind']): InboxHighlight {
    return {
      messageId: message.id,
      authorName: message.author?.displayName || message.author?.username || message.webhookName || 'Someone',
      snippet: (message.content || message.title || '').slice(0, 240),
      kind, createdAt: message.createdAt.toISOString()
    }
  }

  private async unread(userId: string, contexts: Map<string, Context>, at: Date): Promise<UnreadRow[]> {
    const channels = [...contexts.values()].filter((c) => c.mode === 'channel' && !c.muted).map((c) => c.id)
    const dms = [...contexts.values()].filter((c) => c.mode === 'dm' && !c.muted).map((c) => c.id)
    // Each lateral scan stops at 100 messages; no unread history is taken from the capped bell.
    return this.prisma.$queryRaw<UnreadRow[]>`
      WITH contexts AS (
        SELECT 'channel'::text AS mode, c.id, COALESCE(rs.last_read_at, sm.joined_at) AS cutoff,
          false AS marked_unread
        FROM channels c
        JOIN server_members sm ON sm.server_id = c.server_id AND sm.user_id = ${userId}
        LEFT JOIN channel_read_states rs ON rs.channel_id = c.id AND rs.user_id = ${userId}
        WHERE c.id = ANY(${channels}::text[])
        UNION ALL
        SELECT 'dm', dm.conversation_id, COALESCE(rs.last_read_at, dm.joined_at), dm.marked_unread
        FROM direct_conversation_members dm
        LEFT JOIN dm_read_states rs ON rs.conversation_id = dm.conversation_id AND rs.user_id = ${userId}
        WHERE dm.user_id = ${userId} AND dm.conversation_id = ANY(${dms}::text[])
      )
      SELECT c.mode, c.id AS "contextId",
        GREATEST(u.count, CASE WHEN c.marked_unread THEN 1 ELSE 0 END)::bigint AS "unreadCount",
        COALESCE(latest.created_at, c.cutoff) AS "latestAt", u.ids
      FROM contexts c
      CROSS JOIN LATERAL (
        SELECT COUNT(*) AS count, (array_agg(m.id ORDER BY m.created_at, m.id))[1:3] AS ids FROM (
          SELECT m.id, m.created_at FROM messages m
          WHERE ((c.mode = 'channel' AND m.channel_id = c.id AND m.thread_parent_id IS NULL)
            OR (c.mode = 'dm' AND m.direct_conversation_id = c.id))
            AND m.created_at > c.cutoff AND m.created_at <= ${at}
            AND m.deleted = false AND m.author_id IS DISTINCT FROM ${userId}
          ORDER BY m.created_at, m.id LIMIT 100
        ) m
      ) u
      LEFT JOIN LATERAL (
        SELECT m.created_at FROM messages m
        WHERE ((c.mode = 'channel' AND m.channel_id = c.id AND m.thread_parent_id IS NULL)
          OR (c.mode = 'dm' AND m.direct_conversation_id = c.id))
          AND m.created_at > c.cutoff AND m.created_at <= ${at}
          AND m.deleted = false AND m.author_id IS DISTINCT FROM ${userId}
        ORDER BY m.created_at DESC LIMIT 1
      ) latest ON true
      WHERE u.count > 0 OR c.marked_unread
    `
  }

  private async collect(userId: string, at: Date): Promise<Record<InboxView, InboxGroup[]>> {
    const contexts = await this.contexts(userId)
    const [unread, notifications, later] = await Promise.all([
      this.unread(userId, contexts, at),
      this.prisma.inAppNotification.findMany({
        where: {
          userId, readAt: null, updatedAt: { lte: at },
          kind: { in: ['mention', 'reply', 'thread_reply'] }
        },
        orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }]
      }),
      this.prisma.inboxLater.findMany({ where: { userId, savedAt: { lte: at } } })
    ])
    const saved = later.map((row) => ({ ...row, target: target(row.target) }))
    const notificationIds = notifications.flatMap((row) => {
      const payload = row.payload as Record<string, unknown> | null
      return typeof payload?.messageId === 'string' ? [payload.messageId] : []
    })
    const messages = await this.messages([
      ...unread.flatMap((row) => row.ids ?? []), ...notificationIds,
      ...saved.flatMap((row) => [row.target.messageId, row.target.threadParentId].filter((id): id is string => !!id))
    ])
    // Parents are loaded together, never once per thread.
    const parentIds = [...messages.values()].flatMap((m) => m.threadParentId ? [m.threadParentId] : [])
    const parents = await this.messages(parentIds.filter((id) => !messages.has(id)))
    for (const [id, parent] of parents) messages.set(id, parent)
    const threadIds = [...new Set(parentIds)]
    const threadCounts = threadIds.length ? await this.prisma.$queryRaw<{
      id: string; count: bigint; last_read_at: Date
    }[]>`
      SELECT p.id, u.count, COALESCE(rs.last_read_at, crs.last_read_at, sm.joined_at) AS last_read_at
      FROM messages p
      JOIN channels c ON c.id = p.channel_id
      JOIN server_members sm ON sm.server_id = c.server_id AND sm.user_id = ${userId}
      LEFT JOIN inbox_thread_read_states rs ON rs.thread_parent_id = p.id AND rs.user_id = ${userId}
      LEFT JOIN channel_read_states crs ON crs.channel_id = c.id AND crs.user_id = ${userId}
      CROSS JOIN LATERAL (
        SELECT COUNT(*) AS count FROM (
          SELECT 1 FROM messages m WHERE m.thread_parent_id = p.id AND m.deleted = false
            AND m.author_id IS DISTINCT FROM ${userId}
            AND m.created_at > COALESCE(rs.last_read_at, crs.last_read_at, sm.joined_at)
            AND m.created_at <= ${at}
          LIMIT 100
        ) unread
      ) u
      WHERE p.id = ANY(${threadIds}::text[]) AND p.deleted = false
    ` : []
    const threads = new Map(threadCounts.map((t) => [t.id, t]))
    const groups = new Map<string, InboxGroup>()
    const unreadKeys = new Set<string>()
    const mentions = new Map<string, Set<string>>()
    const replies = new Map<string, Set<string>>()
    const participating = new Set<string>()
    const savedTargets = new Map<string, InboxTarget>()
    const ensure = (t: InboxTarget, date: Date): InboxGroup => {
      const key = groupKey(t)
      let group = groups.get(key)
      if (!group) {
        const ctx = contexts.get(`${t.mode}:${t.contextId}`)!
        const parent = t.threadParentId ? messages.get(t.threadParentId) : null
        group = {
          key, target: t, name: parent?.title ? `${ctx.name} · ${parent.title}` : ctx.name,
          serverName: ctx.serverName, unreadCount: 0, mentionCount: 0, replyCount: 0,
          latestAt: date.toISOString(), highlights: [], savedAt: null
        }
        groups.set(key, group)
      }
      if (date.toISOString() > group.latestAt) group.latestAt = date.toISOString()
      return group
    }
    const addHighlight = (group: InboxGroup, message: MessageRow, kind: InboxHighlight['kind']) => {
      const old = group.highlights.find((h) => h.messageId === message.id)
      if (!old) group.highlights.push(this.highlight(message, kind))
      else if (kind === 'mention' || (old.kind === 'message' && kind !== 'message')) old.kind = kind
    }
    for (const row of unread) {
      const ctx = contexts.get(`${row.mode}:${row.contextId}`)
      if (!ctx || ctx.muted) continue
      const t: InboxTarget = {
        mode: row.mode, contextId: row.contextId, serverId: ctx.serverId,
        threadParentId: null, messageId: row.ids?.[0] ?? null
      }
      if (!this.available(t, contexts, messages)) continue
      const group = ensure(t, row.latestAt)
      group.unreadCount = Math.min(100, Number(row.unreadCount))
      unreadKeys.add(group.key)
      for (const id of row.ids ?? []) {
        const message = messages.get(id)
        if (message && !message.deleted) addHighlight(group, message, 'message')
      }
    }
    for (const row of notifications) {
      const payload = row.payload as Record<string, unknown> | null
      const message = typeof payload?.messageId === 'string' ? messages.get(payload.messageId) : null
      if (!message || message.deleted || message.authorId === userId || message.createdAt > at) continue
      const mode = message.channelId ? 'channel' : 'dm'
      const contextId = message.channelId ?? message.directConversationId
      if (!contextId) continue
      const ctx = contexts.get(`${mode}:${contextId}`)
      const cutoff = message.threadParentId ? threads.get(message.threadParentId)?.last_read_at : ctx?.lastReadAt
      if (!ctx || ctx.muted || (cutoff && message.createdAt <= cutoff)) continue
      const t: InboxTarget = {
        mode, contextId, serverId: ctx.serverId, threadParentId: message.threadParentId, messageId: message.id
      }
      if (!this.available(t, contexts, messages)) continue
      const group = ensure(t, message.createdAt)
      const kind = row.kind as 'mention' | 'reply' | 'thread_reply'
      addHighlight(group, message, kind)
      if (kind === 'mention') {
        const set = mentions.get(group.key) ?? new Set<string>()
        set.add(message.id)
        mentions.set(group.key, set)
      }
      // A direct reply that also mentions its recipient only has a mention row.
      if (kind === 'reply' || kind === 'thread_reply' || message.replyTo?.authorId === userId) {
        const set = replies.get(group.key) ?? new Set<string>()
        set.add(message.id)
        replies.set(group.key, set)
      }
      if (t.threadParentId) {
        if (kind === 'thread_reply') participating.add(group.key)
        group.unreadCount = Math.max(group.unreadCount, Number(threads.get(t.threadParentId)?.count ?? 1))
        unreadKeys.add(group.key)
      }
    }
    for (const row of saved) {
      if (!this.available(row.target, contexts, messages)) continue
      const group = ensure(row.target, row.savedAt)
      savedTargets.set(group.key, row.target)
      group.savedAt = row.savedAt.toISOString()
      const message = row.target.messageId ? messages.get(row.target.messageId) : null
      if (message) addHighlight(group, message, 'message')
    }
    const all = [...groups.values()]
    for (const group of all) {
      group.mentionCount = mentions.get(group.key)?.size ?? 0
      group.replyCount = participating.has(group.key) ?
        Math.max(replies.get(group.key)?.size ?? 0, group.unreadCount) : replies.get(group.key)?.size ?? 0
      group.highlights.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.messageId.localeCompare(b.messageId))
      // In directed views, navigation must land on directed activity, not an unrelated unread.
      group.highlights = group.highlights.slice(0, 3)
    }
    const ordered = (rows: InboxGroup[]) => rows.sort((a, b) =>
      b.latestAt.localeCompare(a.latestAt) || a.key.localeCompare(b.key))
    const directed = (kind: 'mentions' | 'replies') => ordered(all.filter((g) =>
      (kind === 'mentions' ? g.mentionCount : g.replyCount) > 0
    ).map((g) => {
      const ids = (kind === 'mentions' ? mentions : replies).get(g.key)!
      const directedMessages = [...ids].map((id) => messages.get(id)!)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id))
      return {
        ...g, target: { ...g.target, messageId: directedMessages[0]!.id },
        highlights: directedMessages.slice(0, 3).map((m) => this.highlight(m,
          mentions.get(g.key)?.has(m.id) ? 'mention' : m.threadParentId ? 'thread_reply' : 'reply'))
      }
    }))
    return {
      unread: ordered(all.filter((g) => unreadKeys.has(g.key))),
      mentions: directed('mentions'), replies: directed('replies'),
      later: ordered(all.filter((g) => g.savedAt !== null).map((g) => ({
        ...g, target: savedTargets.get(g.key)!
      })))
    }
  }

  async page(userId: string, query: unknown): Promise<InboxPage> {
    const input = object(query, ['view', 'cursor', 'limit'])
    const selected = input.view === undefined ? 'unread' : view(input.view)
    const limit = input.limit === undefined ? 30 : Number(input.limit)
    if (!Number.isInteger(limit) || limit < 1 || limit > 100 ||
      (input.limit !== undefined && (typeof input.limit !== 'string' || !/^\d+$/.test(input.limit)))) {
      throw new BadRequestException('Invalid inbox limit')
    }
    let at = new Date()
    let after: { key: string; latestAt: string } | undefined
    if (input.cursor !== undefined) {
      try {
        if (typeof input.cursor !== 'string' || input.cursor.length > 2000) throw new Error('cursor')
        const cursor = object(JSON.parse(Buffer.from(input.cursor, 'base64url').toString('utf8')),
          ['view', 'snapshotAt', 'key', 'latestAt'])
        if (cursor.view !== selected || typeof cursor.key !== 'string') throw new Error('cursor')
        at = new Date(isoDate(cursor.snapshotAt))
        if (at > new Date()) throw new Error('cursor')
        after = { key: cursor.key, latestAt: isoDate(cursor.latestAt) }
      } catch {
        throw new BadRequestException('Invalid inbox cursor')
      }
    }
    const contexts = await this.contexts(userId)
    const unread = await this.unread(userId, contexts, at)
    const result = await indexInboxPage(this.prisma, userId, at, [...contexts.values()], unread, selected, limit, after)
    const page = result.groups.slice(0, limit)
    const messages = await this.messages(page.flatMap(g => [g.messageId, g.threadParentId, ...g.highlights.map(h => h.messageId)]
      .filter((id): id is string => !!id)))
    const groups = page.flatMap((g): InboxGroup[] => {
      const t: InboxTarget = { mode: g.mode, contextId: g.contextId, serverId: g.serverId, threadParentId: g.threadParentId, messageId: g.messageId }
      if (!this.available(t, contexts, messages)) return []
      const ctx = contexts.get(`${t.mode}:${t.contextId}`)!
      const parent = t.threadParentId ? messages.get(t.threadParentId) : null
      return [{ key: g.key, target: t, name: parent?.title ? `${ctx.name} · ${parent.title}` : ctx.name,
        serverName: ctx.serverName, unreadCount: g.unreadCount, mentionCount: g.mentionCount, replyCount: g.replyCount,
        latestAt: new Date(g.latestAt).toISOString(), savedAt: g.savedAt ? new Date(g.savedAt).toISOString() : null,
        highlights: g.highlights.flatMap(h => {
          const message = messages.get(h.messageId)
          return message && !message.deleted ? [this.highlight(message, h.kind)] : []
        }) }]
    })
    const last = page[page.length - 1]
    return {
      groups,
      counts: result.counts,
      snapshotAt: at.toISOString(),
      ...(result.groups.length > limit && last ? { nextCursor: Buffer.from(JSON.stringify({
        view: selected, snapshotAt: at.toISOString(), key: last.key, latestAt: new Date(last.latestAt).toISOString()
      })).toString('base64url') } : {})
    }
  }

  async saveLater(userId: string, body: unknown) {
    const input = object(body, ['target'])
    const t = target(input.target)
    await this.requireTarget(userId, t)
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`
      await this.putLater(tx, userId, t)
    })
    this.bump(userId)
    return { ok: true as const }
  }

  private async putLater(tx: Database, userId: string, t: InboxTarget) {
    const key = groupKey(t)
    await tx.inboxLater.upsert({
      where: { userId_key: { userId, key } },
      create: { userId, key, target: t as unknown as Prisma.InputJsonValue },
      update: { target: t as unknown as Prisma.InputJsonValue, savedAt: new Date() }
    })
    // Always retain this save, including when saved timestamps tie.
    await tx.$executeRaw`
      DELETE FROM inbox_later
      WHERE user_id = ${userId} AND key IN (
        SELECT key FROM inbox_later
        WHERE user_id = ${userId} AND key <> ${key}
        ORDER BY saved_at DESC, key DESC
        OFFSET ${INBOX_LATER_CAP - 1}
      )
    `
  }

  async removeLater(userId: string, body: unknown) {
    const input = object(body, ['target'])
    const t = target(input.target)
    await this.requireTarget(userId, t)
    await this.prisma.inboxLater.deleteMany({ where: { userId, key: groupKey(t) } })
    this.bump(userId)
    return { ok: true as const }
  }

  private async acknowledge(tx: Database, userId: string, t: InboxTarget, cutoff: Date, session?: InboxSession) {
    // Coalesced rows updated after the frozen snapshot must remain outstanding.
    const cleared = await tx.$queryRaw<{ mentions: bigint }[]>`
      WITH cleared AS (
        UPDATE in_app_notifications n SET read_at = ${cutoff}
        WHERE n.user_id = ${userId} AND n.read_at IS NULL AND n.updated_at <= ${cutoff}
          AND (
            (${t.mode === 'dm'} AND n.dedupe_key = ${`dm:${t.contextId}`})
            OR (${t.mode === 'channel'} AND EXISTS (
              SELECT 1 FROM messages m WHERE m.id = n.payload->>'messageId'
                AND m.channel_id = ${t.contextId}
                AND m.thread_parent_id IS NOT DISTINCT FROM ${t.threadParentId}::text
            ) AND n.kind IN ('mention', 'reply', 'thread_reply', 'channel_message'))
          )
        RETURNING n.kind
      )
      SELECT COUNT(*) FILTER (WHERE kind = 'mention') AS mentions FROM cleared
    `
    if (t.mode === 'channel' && t.threadParentId === null) {
      // Preserve the pre-Inbox channel baseline before advancing only the root.
      await tx.$executeRaw`
        INSERT INTO inbox_thread_read_states (user_id, thread_parent_id, last_read_at)
        SELECT ${userId}, m.id, COALESCE(crs.last_read_at, sm.joined_at)
        FROM messages m
        JOIN channels c ON c.id = m.channel_id
        JOIN server_members sm ON sm.server_id = c.server_id AND sm.user_id = ${userId}
        LEFT JOIN channel_read_states crs ON crs.channel_id = c.id AND crs.user_id = ${userId}
        WHERE m.channel_id = ${t.contextId} AND m.thread_parent_id IS NULL
          AND EXISTS (SELECT 1 FROM messages reply WHERE reply.thread_parent_id = m.id)
        ORDER BY m.id
        ON CONFLICT (user_id, thread_parent_id) DO NOTHING
      `
      await tx.$executeRaw`
        INSERT INTO channel_read_states (user_id, channel_id, last_read_at, mention_count)
        SELECT ${userId}, ${t.contextId}, GREATEST(${cutoff}, sm.joined_at), (
          SELECT COUNT(*)::int FROM in_app_notifications n WHERE n.user_id = ${userId}
            AND n.read_at IS NULL AND n.kind = 'mention' AND n.payload->>'channelId' = ${t.contextId}
        )
        FROM server_members sm WHERE sm.user_id = ${userId} AND sm.server_id = ${t.serverId}
        ON CONFLICT (user_id, channel_id) DO UPDATE
          SET last_read_at = GREATEST(channel_read_states.last_read_at, EXCLUDED.last_read_at),
            mention_count = EXCLUDED.mention_count
      `
    }
    if (t.mode === 'channel' && t.threadParentId) {
      await tx.$executeRaw`
        INSERT INTO inbox_thread_read_states (user_id, thread_parent_id, last_read_at)
        SELECT ${userId}, ${t.threadParentId},
          GREATEST(${cutoff}, COALESCE(rs.last_read_at, crs.last_read_at, sm.joined_at))
        FROM server_members sm
        LEFT JOIN channel_read_states crs ON crs.channel_id = ${t.contextId} AND crs.user_id = ${userId}
        LEFT JOIN inbox_thread_read_states rs ON rs.thread_parent_id = ${t.threadParentId} AND rs.user_id = ${userId}
        WHERE sm.user_id = ${userId} AND sm.server_id = ${t.serverId}
        ON CONFLICT (user_id, thread_parent_id) DO UPDATE
          SET last_read_at = GREATEST(inbox_thread_read_states.last_read_at, EXCLUDED.last_read_at)
      `
      await tx.$executeRaw`
        UPDATE channel_read_states SET mention_count = GREATEST(0, mention_count - ${Number(cleared[0]!.mentions)})
        WHERE user_id = ${userId} AND channel_id = ${t.contextId}
      `
    }
    if (t.mode === 'dm') {
      await tx.directConversationMember.updateMany({
        where: { userId, conversationId: t.contextId }, data: { markedUnread: false }
      })
      const rows = await tx.$queryRaw<{ last_read_at: Date }[]>`
        INSERT INTO dm_read_states (user_id, conversation_id, last_read_at, mention_count)
        SELECT ${userId}, ${t.contextId}, GREATEST(${cutoff}, dm.joined_at), (
          SELECT COUNT(*)::int FROM (
            SELECT 1 FROM messages m WHERE m.direct_conversation_id = ${t.contextId}
              AND m.created_at > GREATEST(${cutoff}, dm.joined_at)
              AND m.deleted = false AND m.author_id IS DISTINCT FROM ${userId}
            LIMIT 100
          ) unread
        )
        FROM direct_conversation_members dm
        WHERE dm.user_id = ${userId} AND dm.conversation_id = ${t.contextId}
        ON CONFLICT (user_id, conversation_id) DO UPDATE
          SET last_read_at = GREATEST(dm_read_states.last_read_at, EXCLUDED.last_read_at),
            mention_count = CASE
              WHEN dm_read_states.last_read_at > EXCLUDED.last_read_at THEN dm_read_states.mention_count
              ELSE EXCLUDED.mention_count END
        RETURNING last_read_at
      `
      if (!rows[0]) throw this.unavailable(session)
      return rows[0].last_read_at
    }
    return null
  }

  private emitReceipt(userId: string, t: InboxTarget, at: Date | null) {
    if (at && t.mode === 'dm') {
      this.events.emit('dm:read', { conversationId: t.contextId, userId, lastReadAt: at.toISOString() })
    }
    this.bump(userId)
  }

  async read(userId: string, body: unknown) {
    const input = object(body, ['target', 'throughAt'])
    const t = target(input.target)
    const cutoff = new Date(isoDate(input.throughAt))
    if (cutoff > new Date()) throw new BadRequestException('Inbox cutoff cannot be in the future')
    await this.requireTarget(userId, t)
    const receipt = await this.prisma.$transaction((tx) => this.acknowledge(tx, userId, t, cutoff))
    this.emitReceipt(userId, t, receipt)
    return { ok: true as const }
  }

  private decode(row: { id: string; revision: number; payload: unknown }): InboxSession {
    const session = storedSession(row.payload)
    if (session.id !== row.id || session.revision !== row.revision) {
      throw new BadRequestException('Invalid persisted inbox session')
    }
    return session
  }

  private async refreshed(userId: string, session: InboxSession): Promise<InboxSession> {
    const [contexts, messages] = await Promise.all([
      this.contexts(userId, session.groups.map((g) => g.target)),
      this.messages(session.groups.flatMap((g) => [g.target.messageId, g.target.threadParentId,
        ...g.highlights.map((h) => h.messageId)]).concat(session.anchor?.messageId ?? [])
        .filter((id): id is string => !!id))
    ])
    const anchorAvailable = !session.anchor || this.available(session.anchor, contexts, messages)
    // Preserve the frozen queue/index, but never disclose revoked/deleted content.
    return {
      ...session,
      anchor: anchorAvailable ? session.anchor : null,
      groups: session.groups.map((g, index) => {
        if (!this.available(g.target, contexts, messages) || (index === session.index && !anchorAvailable)) {
          return { ...g, name: 'Unavailable', serverName: null, highlights: [],
            unreadCount: 0, mentionCount: 0, replyCount: 0, unavailable: true }
        }
        const ctx = contexts.get(`${g.target.mode}:${g.target.contextId}`)!
        return { ...g, name: ctx.name, serverName: ctx.serverName, unavailable: false,
          highlights: g.highlights.filter((h) => this.available(
            { ...g.target, messageId: h.messageId }, contexts, messages)) }
      })
    }
  }

  async getSession(userId: string) {
    const row = await this.prisma.inboxSession.findUnique({ where: { userId } })
    return { session: row ? await this.refreshed(userId, this.decode(row)) : null }
  }

  async startSession(userId: string, body: unknown) {
    const input = object(body, ['view', 'replace'])
    const selected = view(input.view)
    if (input.replace !== undefined && typeof input.replace !== 'boolean') {
      throw new BadRequestException('Invalid inbox replacement flag')
    }
    const old = await this.prisma.inboxSession.findUnique({ where: { userId } })
    if (old && !input.replace) {
      const session = this.decode(old)
      if (session.index < session.groups.length) return { session: await this.refreshed(userId, session) }
    }
    const at = new Date()
    const groups = (await this.collect(userId, at))[selected]
    const fresh: InboxSession = {
      id: randomUUID(), revision: 0, view: selected, snapshotAt: at.toISOString(),
      groups, index: 0, completed: 0, deferred: 0, anchor: null
    }
    const session = await this.prisma.$transaction(async (tx) => {
      // Serialize creation/replacement across devices, including the first session.
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`
      const existing = await tx.inboxSession.findUnique({ where: { userId } })
      if (existing && !input.replace) {
        const parsed = this.decode(existing)
        if (parsed.index < parsed.groups.length) return parsed
      }
      await tx.inboxSession.upsert({
        where: { userId },
        create: { userId, id: fresh.id, revision: 0, payload: fresh as unknown as Prisma.InputJsonValue },
        update: { id: fresh.id, revision: 0, payload: fresh as unknown as Prisma.InputJsonValue }
      })
      return fresh
    })
    this.bump(userId)
    return { session: await this.refreshed(userId, session) }
  }

  async anchor(userId: string, body: unknown) {
    const input = object(body, ['id', 'revision', 'target'])
    const t = target(input.target)
    if (!t.messageId) throw new BadRequestException('Inbox anchor requires a message')
    return this.mutateSession(userId, uuid(input.id), integer(input.revision), { target: t })
  }

  async advance(userId: string, body: unknown) {
    const input = object(body, ['id', 'revision', 'action'])
    if (!['done', 'later', 'skip'].includes(input.action as string)) {
      throw new BadRequestException('Invalid inbox action')
    }
    return this.mutateSession(userId, uuid(input.id), integer(input.revision),
      { action: input.action as 'done' | 'later' | 'skip' })
  }

  private async mutateSession(
    userId: string, id: string, revision: number,
    change: { target: InboxTarget } | { action: 'done' | 'later' | 'skip' }
  ) {
    let receipt: Date | null = null
    let receiptTarget: InboxTarget | undefined
    const session = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`
      const row = await tx.inboxSession.findUnique({ where: { userId } })
      if (!row || row.id !== id) throw new NotFoundException('Inbox session not found')
      if (row.revision !== revision) throw new ConflictException('Inbox session revision conflict')
      const session = this.decode(row)
      const group = session.groups[session.index]
      if (!group) throw new ConflictException('Inbox session is complete')
      if ('target' in change) {
        if (groupKey(change.target) !== group.key || change.target.serverId !== group.target.serverId) {
          throw new BadRequestException('Anchor must belong to the current inbox group')
        }
        await this.requireTarget(userId, change.target, session)
        session.anchor = change.target
      } else {
        const t = session.anchor ?? group.target
        if (change.action !== 'skip') await this.requireTarget(userId, t, session)
        if (change.action === 'done') {
          receiptTarget = t
          receipt = await this.acknowledge(tx, userId, t, new Date(session.snapshotAt), session)
          if (group.savedAt !== null) {
            await tx.inboxLater.deleteMany({ where: { userId, key: group.key } })
          }
          session.completed++
        } else if (change.action === 'later') {
          await this.putLater(tx, userId, t)
          session.deferred++
        }
        session.index++
        session.anchor = null
      }
      session.revision++
      const updated = await tx.inboxSession.updateMany({
        where: { userId, id, revision },
        data: { revision: session.revision, payload: session as unknown as Prisma.InputJsonValue }
      })
      if (updated.count !== 1) throw new ConflictException('Inbox session revision conflict')
      return session
    })
    if (receiptTarget) this.emitReceipt(userId, receiptTarget, receipt)
    else this.bump(userId)
    return { session: await this.refreshed(userId, session) }
  }
}
