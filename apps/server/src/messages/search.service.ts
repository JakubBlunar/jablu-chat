import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

type SearchPage = { ids: string[]; total: number }

interface ParsedQuery {
  text: string
  hasImage: boolean
  hasFile: boolean
  hasLink: boolean
  hasPoll: boolean
  hasPinned: boolean
  fromUsername: string | null
}

function parseSearchQuery(raw: string): ParsedQuery {
  let text = raw
  const filters: ParsedQuery = {
    text: '',
    hasImage: false,
    hasFile: false,
    hasLink: false,
    hasPoll: false,
    hasPinned: false,
    fromUsername: null
  }

  text = text.replace(/has:(image|file|link|poll|pin(?:ned)?)/gi, (_, type: string) => {
    const t = type.toLowerCase()
    if (t === 'image') filters.hasImage = true
    else if (t === 'file') filters.hasFile = true
    else if (t === 'link') filters.hasLink = true
    else if (t === 'poll') filters.hasPoll = true
    else if (t === 'pin' || t === 'pinned') filters.hasPinned = true
    return ''
  })

  text = text.replace(/from:(\S+)/gi, (_, username: string) => {
    filters.fromUsername = username.replace(/^@/, '')
    return ''
  })

  filters.text = text.trim()
  return filters
}

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async searchMessages(
    userId: string,
    query: string,
    serverId?: string,
    channelId?: string,
    dmOnly?: boolean,
    conversationId?: string,
    limit = 25,
    offset = 0
  ) {
    const take = Math.min(Math.max(1, limit), 50)
    const skip = Math.max(0, offset)
    const parsed = parseSearchQuery(query)

    const tsQuery = parsed.text
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w.replace(/[^\w\u00C0-\u024F\u0400-\u04FF\u3000-\u9FFF]/g, ''))
      .filter(Boolean)
      .map((w) => `${w}:*`)
      .join(' & ')

    const hasFiltersOnly = !tsQuery && (parsed.hasImage || parsed.hasFile || parsed.hasLink || parsed.hasPoll || parsed.hasPinned || parsed.fromUsername)
    if (!tsQuery && !hasFiltersOnly) return { results: [], total: 0 }

    let fromUserId: string | null = null
    if (parsed.fromUsername) {
      const user = await this.prisma.user.findFirst({
        where: {
          OR: [
            { username: { equals: parsed.fromUsername, mode: 'insensitive' } },
            { displayName: { equals: parsed.fromUsername, mode: 'insensitive' } }
          ]
        },
        select: { id: true }
      })
      if (!user) return { results: [], total: 0 }
      fromUserId = user.id
    }

    const filters = { ...parsed, fromUserId }

    if (conversationId) {
      const isMember = await this.prisma.directConversationMember.findFirst({
        where: { conversationId, userId }
      })
      if (!isMember) return { results: [], total: 0 }

      const dmPage = await this.searchInDms([conversationId], tsQuery, take, skip, filters)
      if (dmPage.ids.length === 0) return { results: [], total: dmPage.total }

      return this.hydrateResults(dmPage.ids, dmPage.total)
    }

    let channelPage: SearchPage = { ids: [], total: 0 }
    let dmPage: SearchPage = { ids: [], total: 0 }

    if (!dmOnly) {
      const memberServerIds = await this.prisma.serverMember
        .findMany({ where: { userId }, select: { serverId: true } })
        .then((rows) => rows.map((r) => r.serverId))

      if (channelId) {
        const ch = await this.prisma.channel.findUnique({
          where: { id: channelId },
          select: { serverId: true }
        })
        if (ch && memberServerIds.includes(ch.serverId)) {
          channelPage = await this.searchInChannels([channelId], tsQuery, take, skip, filters)
        }
      } else if (serverId) {
        if (memberServerIds.includes(serverId)) {
          const channels = await this.prisma.channel.findMany({
            where: { serverId },
            select: { id: true }
          })
          channelPage = await this.searchInChannels(
            channels.map((c) => c.id),
            tsQuery,
            take,
            skip,
            filters
          )
        }
      } else {
        const channels = await this.prisma.channel.findMany({
          where: { serverId: { in: memberServerIds } },
          select: { id: true }
        })
        if (channels.length > 0) {
          channelPage = await this.searchInChannels(
            channels.map((c) => c.id),
            tsQuery,
            take,
            skip,
            filters
          )
        }
      }
    }

    if (!channelId && !serverId) {
      const dmConvIds = await this.prisma.directConversationMember
        .findMany({ where: { userId }, select: { conversationId: true } })
        .then((rows) => rows.map((r) => r.conversationId))

      if (dmConvIds.length > 0) {
        dmPage = await this.searchInDms(dmConvIds, tsQuery, take, skip, filters)
      }
    }

    const allIds = [...channelPage.ids, ...dmPage.ids]
    const total = channelPage.total + dmPage.total

    if (allIds.length === 0) return { results: [], total }

    return this.hydrateResults(allIds, total)
  }

  private async hydrateResults(ids: string[], total: number) {
    const fullMessages = await this.prisma.message.findMany({
      where: { id: { in: ids } },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true
          }
        },
        channel: { select: { id: true, name: true, serverId: true } },
        directConversation: { select: { id: true } }
      },
      orderBy: { createdAt: 'desc' }
    })

    return {
      results: fullMessages.map((m) => ({
        id: m.id,
        content: m.content,
        authorId: m.authorId,
        author: m.author,
        channelId: m.channelId,
        channel: m.channel,
        dmConversationId: m.directConversationId,
        createdAt: m.createdAt
      })),
      total
    }
  }

  private buildFilterClauses(
    filters: ParsedQuery & { fromUserId: string | null }
  ): { fragments: Prisma.Sql[]; joins: Prisma.Sql[] } {
    const fragments: Prisma.Sql[] = []
    const joins: Prisma.Sql[] = []

    if (filters.fromUserId) {
      fragments.push(Prisma.sql`AND m.author_id = ${filters.fromUserId}`)
    }
    if (filters.hasPinned) {
      fragments.push(Prisma.sql`AND m.pinned = true`)
    }
    if (filters.hasImage) {
      joins.push(Prisma.sql`INNER JOIN attachments ai ON ai.message_id = m.id AND ai.mime_type LIKE 'image/%'`)
    }
    if (filters.hasFile) {
      joins.push(Prisma.sql`INNER JOIN attachments af ON af.message_id = m.id AND af.mime_type NOT LIKE 'image/%'`)
    }
    if (filters.hasLink) {
      joins.push(Prisma.sql`INNER JOIN link_previews lp ON lp.message_id = m.id`)
    }
    if (filters.hasPoll) {
      joins.push(Prisma.sql`INNER JOIN polls p ON p.message_id = m.id`)
    }

    return { fragments, joins }
  }

  private async searchInChannels(
    channelIds: string[],
    tsQuery: string,
    limit: number,
    offset: number,
    filters: ParsedQuery & { fromUserId: string | null }
  ): Promise<SearchPage> {
    if (channelIds.length === 0) return { ids: [], total: 0 }
    const { fragments, joins } = this.buildFilterClauses(filters)

    const textCondition = tsQuery
      ? Prisma.sql`AND to_tsvector('simple', m.content) @@ to_tsquery('simple', ${tsQuery})`
      : Prisma.sql``

    const joinSql = joins.reduce((acc, j) => Prisma.sql`${acc} ${j}`, Prisma.sql``)
    const filterSql = fragments.reduce((acc, f) => Prisma.sql`${acc} ${f}`, Prisma.sql``)

    const [rows, countRows] = await Promise.all([
      this.prisma.$queryRaw<{ id: string }[]>`
        SELECT DISTINCT m.id, m.created_at FROM messages m
        ${joinSql}
        WHERE m.channel_id = ANY(${channelIds})
          AND m.deleted = false
          ${textCondition}
          ${filterSql}
        ORDER BY m.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `,
      this.prisma.$queryRaw<{ count: bigint }[]>`
        SELECT count(DISTINCT m.id) FROM messages m
        ${joinSql}
        WHERE m.channel_id = ANY(${channelIds})
          AND m.deleted = false
          ${textCondition}
          ${filterSql}
      `
    ])
    return {
      ids: rows.map((r) => r.id),
      total: Number(countRows[0]?.count ?? 0)
    }
  }

  private async searchInDms(
    conversationIds: string[],
    tsQuery: string,
    limit: number,
    offset: number,
    filters: ParsedQuery & { fromUserId: string | null }
  ): Promise<SearchPage> {
    if (conversationIds.length === 0) return { ids: [], total: 0 }
    const { fragments, joins } = this.buildFilterClauses(filters)

    const textCondition = tsQuery
      ? Prisma.sql`AND to_tsvector('simple', m.content) @@ to_tsquery('simple', ${tsQuery})`
      : Prisma.sql``

    const joinSql = joins.reduce((acc, j) => Prisma.sql`${acc} ${j}`, Prisma.sql``)
    const filterSql = fragments.reduce((acc, f) => Prisma.sql`${acc} ${f}`, Prisma.sql``)

    const [rows, countRows] = await Promise.all([
      this.prisma.$queryRaw<{ id: string }[]>`
        SELECT DISTINCT m.id, m.created_at FROM messages m
        ${joinSql}
        WHERE m.direct_conversation_id = ANY(${conversationIds})
          AND m.deleted = false
          ${textCondition}
          ${filterSql}
        ORDER BY m.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `,
      this.prisma.$queryRaw<{ count: bigint }[]>`
        SELECT count(DISTINCT m.id) FROM messages m
        ${joinSql}
        WHERE m.direct_conversation_id = ANY(${conversationIds})
          AND m.deleted = false
          ${textCondition}
          ${filterSql}
      `
    ])
    return {
      ids: rows.map((r) => r.id),
      total: Number(countRows[0]?.count ?? 0)
    }
  }
}
