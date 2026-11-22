import { createHash } from 'node:crypto'
import { BadRequestException, ConflictException } from '@nestjs/common'
import { Prisma, type ForumSortOrder } from '../prisma-client'
import type { PrismaService } from '../prisma/prisma.service'

type Cursor = {
  v: 1
  channel: string
  sort: string
  tag: string | null
  cutoff: number
  at: number
  id: string
  fingerprint: string
}
type Row = { id: string; at: number }

function decode(value: string | undefined, channel: string, sort: string, tag?: string): Cursor | undefined {
  if (!value || /^[0-9a-f-]{36}$/i.test(value)) return undefined // legacy clients send a post id
  try {
    if (value.length > 2048 || !/^[a-zA-Z0-9_-]+$/.test(value)) throw Error()
    const cursor = JSON.parse(Buffer.from(value, 'base64url').toString()) as Cursor
    if (
      cursor.v !== 1 ||
      cursor.channel !== channel ||
      cursor.sort !== sort ||
      cursor.tag !== (tag ?? null) ||
      !Number.isSafeInteger(cursor.cutoff) ||
      !Number.isSafeInteger(cursor.at) ||
      !Number.isFinite(new Date(cursor.cutoff).getTime()) ||
      !Number.isFinite(new Date(cursor.at).getTime()) ||
      cursor.cutoff > Date.now() + 5000 ||
      typeof cursor.id !== 'string' ||
      cursor.id.length > 64 ||
      !/^-?\d+$/.test(cursor.fingerprint)
    )
      throw Error()
    return cursor
  } catch {
    throw new BadRequestException('Invalid forum cursor')
  }
}

/** Compute ordering on compact rows; only the selected ids are hydrated later. */
export async function forumPage(
  prisma: Pick<PrismaService, '$queryRaw'>,
  channelId: string,
  sort: ForumSortOrder,
  tagId: string | undefined,
  value: string | undefined,
  take: number,
  tagIds: string[] = [],
  query = ''
) {
  const tags = [...new Set(tagId ? [tagId, ...tagIds] : tagIds)].sort()
  const scope =
    query || tags.length > 1
      ? createHash('sha256')
          .update(JSON.stringify([tags, query]))
          .digest('hex')
      : tags[0]
  const cursor = decode(value, channelId, sort, scope)
  const legacy = value && !cursor ? value : undefined
  const cutoff = new Date(cursor?.cutoff ?? Date.now())
  const activity = sort === 'newest' ? Prisma.sql`p.created_at` : Prisma.sql`COALESCE(reply.created_at, p.created_at)`
  const join =
    sort === 'newest'
      ? Prisma.empty
      : Prisma.sql`LEFT JOIN LATERAL (
    SELECT r.created_at FROM messages r WHERE r.thread_parent_id = p.id AND NOT r.deleted AND r.created_at <= ${cutoff}
    ORDER BY r.created_at DESC, r.id DESC LIMIT 1
  ) reply ON true`
  const boundary = cursor
    ? Prisma.sql`WHERE (activity, id) < (${new Date(cursor.at)}, ${cursor.id})`
    : legacy
      ? Prisma.sql`WHERE (activity, id) < (SELECT activity, id FROM ranked WHERE id = ${legacy})`
      : Prisma.empty
  const [result] = await prisma.$queryRaw<{ page: Row[]; fingerprint: string; anchorExists: boolean }[]>`
    WITH ranked AS MATERIALIZED (
      SELECT p.id, ${activity} AS activity FROM messages p ${join}
      WHERE p.channel_id = ${channelId} AND NOT p.deleted AND p.thread_parent_id IS NULL
        AND p.title IS NOT NULL AND p.created_at <= ${cutoff}
        ${
          tags.length
            ? Prisma.sql`AND (SELECT COUNT(DISTINCT pt.tag_id) FROM forum_post_tags pt
          WHERE pt.message_id = p.id AND pt.tag_id IN (${Prisma.join(tags)})) = ${tags.length}`
            : Prisma.empty
        }
        ${
          query
            ? Prisma.sql`AND (strpos(lower(p.title), lower(${query})) > 0
          OR strpos(lower(p.content), lower(${query})) > 0
          OR EXISTS (SELECT 1 FROM users u WHERE u.id = p.author_id AND strpos(lower(u.username), lower(${query})) > 0))`
            : Prisma.empty
        }
    ), page AS (
      SELECT id, activity FROM ranked ${boundary} ORDER BY activity DESC, id DESC LIMIT ${take + 1}
    )
    SELECT COALESCE((SELECT jsonb_agg(jsonb_build_object('id', id, 'at', (EXTRACT(EPOCH FROM activity) * 1000)::bigint)
        ORDER BY activity DESC, id DESC) FROM page), '[]'::jsonb) AS page,
      (SELECT COALESCE(bit_xor(hashtextextended(id || '|' || activity::text, 0)), 0)::text FROM ranked) AS fingerprint,
      ${legacy ? Prisma.sql`EXISTS(SELECT 1 FROM ranked WHERE id = ${legacy})` : Prisma.sql`true`} AS "anchorExists"
  `
  if (!result.anchorExists) throw new BadRequestException('Invalid cursor')
  // The checksum is a consistency marker, not an authorization credential.
  // New replies after the cutoff wait for refresh; deleting the latest reply
  // moves activity backwards and explicitly invalidates that snapshot.
  if (cursor && cursor.fingerprint !== result.fingerprint) {
    throw new ConflictException({ code: 'FORUM_PAGE_STALE', message: 'Forum activity changed; refresh the list' })
  }
  const hasMore = result.page.length > take
  const page = result.page.slice(0, take)
  const last = page.at(-1)
  return {
    page,
    hasMore,
    cutoff,
    nextCursor:
      hasMore && last
        ? Buffer.from(
            JSON.stringify({
              v: 1,
              channel: channelId,
              sort,
              tag: scope ?? null,
              cutoff: cutoff.getTime(),
              at: last.at,
              id: last.id,
              fingerprint: result.fingerprint
            } satisfies Cursor)
          ).toString('base64url')
        : null
  }
}
