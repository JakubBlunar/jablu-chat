import type { InboxHighlight, InboxPage, InboxTarget, InboxView } from '@chat/shared'
import type { PrismaService } from '../prisma/prisma.service'

type Context = { mode: 'channel' | 'dm'; id: string; serverId: string | null; muted: boolean; lastReadAt: Date }
type Unread = { mode: string; contextId: string; unreadCount: bigint; latestAt: Date; ids: string[] }
export type IndexedGroup = {
  key: string; mode: InboxTarget['mode']; contextId: string; serverId: string | null; threadParentId: string | null
  messageId: string | null; latestAt: string; savedAt: string | null
  unreadCount: number; mentionCount: number; replyCount: number
  highlights: { messageId: string; kind: InboxHighlight['kind'] }[]
}

/** Recomputed metadata index: current permissions/reads, frozen incoming-activity cutoff, no mutable cache. */
export async function indexInboxPage(prisma: Pick<PrismaService, '$queryRaw'>, userId: string, at: Date,
  contexts: Context[], unread: Unread[], selected: InboxView, limit: number,
  after?: { key: string; latestAt: string }
): Promise<{ groups: IndexedGroup[]; counts: InboxPage['counts'] }> {
  const result = await prisma.$queryRaw<{ groups: IndexedGroup[]; counts: InboxPage['counts'] }[]>`
    WITH contexts AS MATERIALIZED (
      SELECT * FROM jsonb_to_recordset(${JSON.stringify(contexts)}::jsonb)
        AS c(mode text, id text, "serverId" text, muted boolean, "lastReadAt" timestamp)
    ), unread AS (
      SELECT * FROM jsonb_to_recordset(${JSON.stringify(unread.map(r => ({ ...r, unreadCount: Number(r.unreadCount) })))}::jsonb)
        AS u(mode text, "contextId" text, "unreadCount" int, "latestAt" timestamp, ids text[])
    ), directed AS MATERIALIZED (
      SELECT DISTINCT ON (m.id, n.kind) c.mode, c.id AS "contextId", c."serverId", m.thread_parent_id AS "threadParentId",
        m.id AS "messageId", m.created_at AS "createdAt", n.updated_at AS "notificationAt", n.id AS "notificationId",
        n.kind::text AS kind, n.kind = 'mention' AS mention,
        (n.kind IN ('reply', 'thread_reply') OR reply.author_id = ${userId}) AS reply,
        n.kind = 'thread_reply' AS participating, COALESCE(rs.last_read_at, c."lastReadAt") AS cutoff
      FROM in_app_notifications n
      JOIN messages m ON m.id = n.payload->>'messageId'
      JOIN contexts c ON (c.mode = 'channel' AND m.channel_id = c.id) OR (c.mode = 'dm' AND m.direct_conversation_id = c.id)
      LEFT JOIN messages parent ON parent.id = m.thread_parent_id
      LEFT JOIN messages reply ON reply.id = m.reply_to_id
      LEFT JOIN inbox_thread_read_states rs ON rs.thread_parent_id = m.thread_parent_id AND rs.user_id = ${userId}
      WHERE n.user_id = ${userId} AND n.read_at IS NULL AND n.updated_at <= ${at}
        AND n.kind IN ('mention', 'reply', 'thread_reply') AND NOT c.muted
        AND NOT m.deleted AND m.author_id IS DISTINCT FROM ${userId} AND m.created_at <= ${at}
        AND m.created_at > COALESCE(rs.last_read_at, c."lastReadAt")
        AND (m.thread_parent_id IS NULL OR (c.mode = 'channel' AND parent.id IS NOT NULL
          AND NOT parent.deleted AND parent.thread_parent_id IS NULL AND parent.channel_id = c.id))
      ORDER BY m.id, n.kind, n.updated_at, n.id
    ), thread_counts AS (
      SELECT t."threadParentId", (SELECT COUNT(*)::int FROM (
        SELECT 1 FROM messages m WHERE m.thread_parent_id = t."threadParentId" AND NOT m.deleted
          AND m.author_id IS DISTINCT FROM ${userId} AND m.created_at > t.cutoff AND m.created_at <= ${at}
        LIMIT 100
      ) bounded) AS count
      FROM (SELECT DISTINCT "threadParentId", cutoff FROM directed WHERE "threadParentId" IS NOT NULL) t
    ), saved AS (
      SELECT c.mode, c.id AS "contextId", c."serverId", l.target->>'threadParentId' AS "threadParentId",
        l.target->>'messageId' AS "messageId", l.saved_at AS "savedAt", m.created_at AS "createdAt"
      FROM inbox_later l
      JOIN contexts c ON c.mode = l.target->>'mode' AND c.id = l.target->>'contextId'
        AND c."serverId" IS NOT DISTINCT FROM l.target->>'serverId'
      LEFT JOIN messages m ON m.id = l.target->>'messageId'
      LEFT JOIN messages parent ON parent.id = l.target->>'threadParentId'
      WHERE l.user_id = ${userId} AND l.saved_at <= ${at}
        AND (l.target->>'threadParentId' IS NULL OR (c.mode = 'channel' AND parent.id IS NOT NULL
          AND NOT parent.deleted AND parent.thread_parent_id IS NULL AND parent.channel_id = c.id))
        AND (l.target->>'messageId' IS NULL OR (m.id IS NOT NULL AND NOT m.deleted
          AND ((c.mode = 'channel' AND m.channel_id = c.id) OR (c.mode = 'dm' AND m.direct_conversation_id = c.id))
          AND (m.id = l.target->>'threadParentId' OR m.thread_parent_id IS NOT DISTINCT FROM l.target->>'threadParentId')))
    ), entries AS MATERIALIZED (
      SELECT c.mode, c.id AS "contextId", c."serverId", NULL::text AS "threadParentId", 'unread'::text AS source,
        m.id AS "messageId", m.created_at AS "createdAt", u."latestAt" AS "activityAt", 'message'::text AS kind,
        u."unreadCount", false AS mention, false AS reply, false AS participating, NULL::timestamp AS "savedAt",
        u."latestAt" AS "notificationAt", ''::text AS "notificationId", i.ordinality AS ordinal
      FROM unread u JOIN contexts c ON c.mode = u.mode AND c.id = u."contextId" AND NOT c.muted
      LEFT JOIN LATERAL unnest(u.ids) WITH ORDINALITY i(id, ordinality) ON true
      LEFT JOIN messages m ON m.id = i.id AND NOT m.deleted
      UNION ALL
      SELECT d.mode, d."contextId", d."serverId", d."threadParentId", 'directed', d."messageId", d."createdAt", d."createdAt", d.kind,
        CASE WHEN d."threadParentId" IS NULL THEN 0 ELSE COALESCE(t.count, 1) END,
        d.mention, COALESCE(d.reply, false), d.participating, NULL::timestamp, d."notificationAt", d."notificationId", 0::bigint
      FROM directed d LEFT JOIN thread_counts t ON t."threadParentId" = d."threadParentId"
      UNION ALL
      SELECT s.mode, s."contextId", s."serverId", s."threadParentId", 'saved', s."messageId", s."createdAt", s."savedAt", 'message',
        0, false, false, false, s."savedAt", s."savedAt", '', 0::bigint FROM saved s
    ), keyed AS MATERIALIZED (
      SELECT *, mode || ':' || "contextId" || ':' || COALESCE("threadParentId", 'root') AS key FROM entries
    ), grouped AS MATERIALIZED (
      SELECT key, mode, "contextId", "serverId", "threadParentId", MAX("activityAt") AS "latestAt", MAX("savedAt") AS "savedAt",
        MAX("unreadCount")::int AS "unreadCount", COUNT(DISTINCT "messageId") FILTER (WHERE mention)::int AS "mentionCount",
        GREATEST(COUNT(DISTINCT "messageId") FILTER (WHERE reply)::int,
          CASE WHEN bool_or(participating) THEN MAX("unreadCount") ELSE 0 END)::int AS "replyCount",
        bool_or(source = 'unread' OR (source = 'directed' AND "threadParentId" IS NOT NULL)) AS unread
      FROM keyed GROUP BY key, mode, "contextId", "serverId", "threadParentId"
    ), page AS MATERIALIZED (
      SELECT * FROM grouped g WHERE
        CASE ${selected} WHEN 'unread' THEN g.unread WHEN 'mentions' THEN g."mentionCount" > 0
          WHEN 'replies' THEN g."replyCount" > 0 ELSE g."savedAt" IS NOT NULL END
        AND (${after?.latestAt ?? null}::timestamp IS NULL OR g."latestAt" < ${after?.latestAt ?? null}::timestamp
          OR (g."latestAt" = ${after?.latestAt ?? null}::timestamp AND g.key COLLATE "C" > ${after?.key ?? ''} COLLATE "C"))
      ORDER BY g."latestAt" DESC, g.key COLLATE "C" LIMIT ${limit + 1}
    ), details AS (
      SELECT g.*,
        (SELECT e."messageId" FROM keyed e WHERE e.key = g.key
          AND CASE ${selected} WHEN 'later' THEN e.source = 'saved' WHEN 'mentions' THEN e.mention
            WHEN 'replies' THEN e.reply ELSE true END
          ORDER BY CASE WHEN ${selected} IN ('mentions', 'replies') THEN 0 WHEN e.source = 'unread' THEN 0 WHEN e.source = 'directed' THEN 1 ELSE 2 END,
            CASE WHEN ${selected} IN ('mentions', 'replies') THEN e."createdAt" ELSE e."notificationAt" END,
            CASE WHEN ${selected} IN ('mentions', 'replies') THEN e."messageId" ELSE '' END,
            e.ordinal, e."notificationId", e."messageId" LIMIT 1) AS "messageId",
        COALESCE((SELECT jsonb_agg(jsonb_build_object('messageId', h."messageId", 'kind', h.kind) ORDER BY h."createdAt", h."messageId") FROM (
          SELECT * FROM (SELECT DISTINCT ON (e."messageId") e."messageId", e."createdAt", e.kind
            FROM keyed e WHERE e.key = g.key AND e."messageId" IS NOT NULL
              AND CASE ${selected} WHEN 'mentions' THEN e.mention WHEN 'replies' THEN e.reply ELSE true END
            ORDER BY e."messageId", CASE WHEN e.mention THEN 0 WHEN e.source = 'directed' THEN 1 ELSE 2 END,
              e."notificationAt", e."notificationId"
          ) unique_messages ORDER BY "createdAt", "messageId" LIMIT 3
        ) h), '[]'::jsonb) AS highlights
      FROM page g
    )
    SELECT jsonb_build_object(
      'unread', COUNT(*) FILTER (WHERE unread), 'mentions', COUNT(*) FILTER (WHERE "mentionCount" > 0),
      'replies', COUNT(*) FILTER (WHERE "replyCount" > 0), 'later', COUNT(*) FILTER (WHERE "savedAt" IS NOT NULL)) AS counts,
      COALESCE((SELECT jsonb_agg(to_jsonb(d) || jsonb_build_object(
        'latestAt', to_char(d."latestAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'savedAt', CASE WHEN d."savedAt" IS NULL THEN NULL ELSE to_char(d."savedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') END)
        ORDER BY d."latestAt" DESC, d.key COLLATE "C") FROM details d), '[]'::jsonb) AS groups
    FROM grouped
  `
  return result[0]
}
