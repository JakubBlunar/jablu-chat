import type { ReactionGroup } from '@chat/shared'
import type { PrismaService } from '../prisma/prisma.service'
import { Prisma } from '../prisma-client'
import { messageInclude, dmMessageInclude, mapMessageToWire, mapDmMessageToWire, type MessageWithRelations } from './message-wire'

export function historyInclude(userId: string) {
  return {
    ...messageInclude,
    reactions: false,
    _count: false,
    threadMessages: false,
    poll: { include: { options: {
      orderBy: { position: 'asc' },
      include: { _count: { select: { votes: true } }, votes: { where: { userId }, select: { userId: true } } }
    } } }
  } satisfies Prisma.MessageInclude
}

type HistoryRow = Prisma.MessageGetPayload<{ include: ReturnType<typeof historyInclude> }>
type ReactionSummary = { messageId: string; emoji: string; isCustom: boolean; count: number; mine: boolean; userIds: string[] }
type ThreadSummary = { messageId: string; count: number; latest: MessageWithRelations['threadMessages'][number] | null }

export const historyDmInclude = { ...dmMessageInclude, reactions: false } satisfies Prisma.MessageInclude

async function reactionSummaries(prisma: Pick<PrismaService, '$queryRaw'>, ids: string[], userId: string) {
  const reactions = await prisma.$queryRaw<ReactionSummary[]>`
    SELECT r.message_id AS "messageId", r.emoji, r.is_custom AS "isCustom", COUNT(*)::int AS count,
      bool_or(r.user_id = ${userId}) AS mine,
      ARRAY(SELECT p.user_id FROM reactions p WHERE p.message_id = r.message_id AND p.emoji = r.emoji
        ORDER BY p.user_id LIMIT 3) AS "userIds"
    FROM reactions r WHERE r.message_id = ANY(${ids}::text[])
    GROUP BY r.message_id, r.emoji, r.is_custom
  `
  const byMessage = new Map<string, ReactionGroup[]>()
  for (const r of reactions) {
    const userIds = [...new Set([...r.userIds, ...(r.mine ? [userId] : [])])]
    const groups = byMessage.get(r.messageId) ?? []
    groups.push({ emoji: r.emoji, isCustom: r.isCustom, count: r.count, userIds, usersComplete: userIds.length === r.count })
    byMessage.set(r.messageId, groups)
  }
  return byMessage
}

export async function mapDmHistory(prisma: Pick<PrismaService, '$queryRaw'>,
  rows: Prisma.MessageGetPayload<{ include: typeof historyDmInclude }>[], userId: string) {
  if (!rows.length) return []
  const reactions = await reactionSummaries(prisma, rows.map((m) => m.id), userId)
  return rows.map((m) => ({ ...mapDmMessageToWire({ ...m, reactions: [] }), reactions: reactions.get(m.id) ?? [] }))
}

/** Two page-scoped aggregates replace unbounded relation hydration. */
export async function mapHistory(prisma: Pick<PrismaService, '$queryRaw'>, rows: HistoryRow[], userId: string) {
  if (!rows.length) return []
  const ids = rows.map((m) => m.id)
  const [byMessage, threads] = await Promise.all([
    reactionSummaries(prisma, ids, userId),
    prisma.$queryRaw<ThreadSummary[]>`
      SELECT m.thread_parent_id AS "messageId", COUNT(*)::int AS count,
        (SELECT jsonb_build_object('content', latest.content, 'createdAt', latest.created_at,
          'author', CASE WHEN u.id IS NULL THEN NULL ELSE jsonb_build_object('id', u.id,
            'username', u.username, 'displayName', u.display_name, 'avatarUrl', u.avatar_url, 'isBot', u.is_bot) END)
         FROM messages latest LEFT JOIN users u ON u.id = latest.author_id
         WHERE latest.thread_parent_id = m.thread_parent_id AND latest.deleted = false
         ORDER BY latest.created_at DESC, latest.id DESC LIMIT 1) AS latest
      FROM messages m WHERE m.thread_parent_id = ANY(${ids}::text[]) AND m.deleted = false
      GROUP BY m.thread_parent_id
    `
  ])
  const byThread = new Map(threads.map((t) => [t.messageId, t]))
  return rows.map((m) => {
    const thread = byThread.get(m.id)
    const wire = mapMessageToWire({ ...m, reactions: [], _count: { threadMessages: thread?.count ?? 0 },
      threadMessages: thread?.latest ? [thread.latest] : [] }, userId)
    return { ...wire, reactions: byMessage.get(m.id) ?? [] }
  })
}
