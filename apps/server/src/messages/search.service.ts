import { Injectable } from '@nestjs/common'
import { Prisma } from '../prisma-client'
import { hasPermission, Permission } from '@chat/shared'
import { PrismaService } from '../prisma/prisma.service'
import { RolesService } from '../roles/roles.service'

type SearchPage = { ids: string[]; total: number }

interface ParsedQuery {
  text: string
  hasImage: boolean
  hasFile: boolean
  hasLink: boolean
  hasPoll: boolean
  hasPinned: boolean
  hasAttachment: boolean
  hasVideo: boolean
  inThreadOnly: boolean
  inRootOnly: boolean
  forumTagNames: string[]
  createdAfter: Date | null
  createdBefore: Date | null
  fromUsername: string | null
}

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

/** Parses YYYY-MM-DD as UTC midnight; returns exclusive end for `before:` semantics. */
function parseFilterDate(raw: string): { dayStart: Date } | null {
  const m = raw.match(ISO_DATE_RE)
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const da = Number(m[3])
  const dayStart = new Date(Date.UTC(y, mo - 1, da))
  if (
    dayStart.getUTCFullYear() !== y ||
    dayStart.getUTCMonth() !== mo - 1 ||
    dayStart.getUTCDate() !== da
  ) {
    return null
  }
  return { dayStart }
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
    hasAttachment: false,
    hasVideo: false,
    inThreadOnly: false,
    inRootOnly: false,
    forumTagNames: [],
    createdAfter: null,
    createdBefore: null,
    fromUsername: null
  }

  text = text.replace(/has:(image|file|link|poll|pin(?:ned)?|attachment|video)/gi, (_, type: string) => {
    const t = type.toLowerCase()
    if (t === 'image') filters.hasImage = true
    else if (t === 'file') filters.hasFile = true
    else if (t === 'link') filters.hasLink = true
    else if (t === 'poll') filters.hasPoll = true
    else if (t === 'pin' || t === 'pinned') filters.hasPinned = true
    else if (t === 'attachment') filters.hasAttachment = true
    else if (t === 'video') filters.hasVideo = true
    return ''
  })

  text = text.replace(/\bin:(thread|root)\b/gi, (_, kind: string) => {
    const k = kind.toLowerCase()
    if (k === 'thread') filters.inThreadOnly = true
    else if (k === 'root') filters.inRootOnly = true
    return ''
  })

  text = text.replace(/after:(\S+)/gi, (_, d: string) => {
    const parsed = parseFilterDate(d)
    if (parsed) filters.createdAfter = parsed.dayStart
    return ''
  })

  text = text.replace(/before:(\S+)/gi, (_, d: string) => {
    const parsed = parseFilterDate(d)
    if (parsed) filters.createdBefore = parsed.dayStart
    return ''
  })

  text = text.replace(/tag:(\S+)/gi, (_, name: string) => {
    const trimmed = name.replace(/^@/, '').trim()
    if (trimmed.length > 0 && trimmed.length <= 64) filters.forumTagNames.push(trimmed)
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly roles: RolesService,
  ) {}

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

    const hasFiltersOnly =
      !tsQuery &&
      (parsed.hasImage ||
        parsed.hasFile ||
        parsed.hasLink ||
        parsed.hasPoll ||
        parsed.hasPinned ||
        parsed.hasAttachment ||
        parsed.hasVideo ||
        parsed.inThreadOnly ||
        parsed.inRootOnly ||
        parsed.forumTagNames.length > 0 ||
        parsed.createdAfter !== null ||
        parsed.createdBefore !== null ||
        parsed.fromUsername)
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
          const visible = await this.getVisibleChannelIds(ch.serverId, userId)
          if (visible.includes(channelId)) {
            channelPage = await this.searchInChannels([channelId], tsQuery, take, skip, filters)
          }
        }
      } else if (serverId) {
        if (memberServerIds.includes(serverId)) {
          const visible = await this.getVisibleChannelIds(serverId, userId)
          if (visible.length > 0) {
            channelPage = await this.searchInChannels(visible, tsQuery, take, skip, filters)
          }
        }
      } else {
        const visibleByServer = await this.roles.getVisibleChannelIdsForServers(userId, memberServerIds)
        const allVisible: string[] = []
        for (const channels of visibleByServer.values()) {
          allVisible.push(...channels)
        }
        if (allVisible.length > 0) {
          channelPage = await this.searchInChannels(allVisible, tsQuery, take, skip, filters)
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

  private async getVisibleChannelIds(serverId: string, userId: string): Promise<string[]> {
    const permMap = await this.roles.getAllChannelPermissions(serverId, userId)
    const VIEW = Permission.VIEW_CHANNEL
    return Object.entries(permMap)
      .filter(([, perms]) => hasPermission(perms, VIEW))
      .map(([chId]) => chId)
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
        channel: { select: { id: true, name: true, serverId: true, type: true } },
        directConversation: { select: { id: true } }
      },
      orderBy: { createdAt: 'desc' }
    })

    return {
      results: fullMessages.map((m) => ({
        id: m.id,
        content: m.content,
        title: m.title,
        threadParentId: m.threadParentId,
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
    if (filters.hasAttachment) {
      fragments.push(
        Prisma.sql`AND EXISTS (SELECT 1 FROM attachments a_any WHERE a_any.message_id = m.id)`
      )
    }
    if (filters.hasVideo) {
      joins.push(
        Prisma.sql`INNER JOIN attachments av ON av.message_id = m.id AND av.mime_type LIKE 'video/%'`
      )
    }
    if (filters.inThreadOnly) {
      fragments.push(Prisma.sql`AND m.thread_parent_id IS NOT NULL`)
    }
    if (filters.inRootOnly) {
      fragments.push(Prisma.sql`AND m.thread_parent_id IS NULL`)
    }
    if (filters.createdAfter) {
      fragments.push(Prisma.sql`AND m.created_at >= ${filters.createdAfter}`)
    }
    if (filters.createdBefore) {
      fragments.push(Prisma.sql`AND m.created_at < ${filters.createdBefore}`)
    }
    filters.forumTagNames.forEach((tagName, i) => {
      const fpt = `fpt_tag_${i}`
      const ft = `ft_tag_${i}`
      joins.push(Prisma.sql`
        INNER JOIN forum_post_tags ${Prisma.raw(fpt)} ON ${Prisma.raw(fpt)}.message_id = m.id
        INNER JOIN forum_tags ${Prisma.raw(ft)} ON ${Prisma.raw(ft)}.id = ${Prisma.raw(fpt)}.tag_id
          AND lower(${Prisma.raw(ft)}.name) = lower(${tagName})
      `)
    })

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
      ? Prisma.sql`AND (to_tsvector('simple', coalesce(m.content, '')) @@ to_tsquery('simple', ${tsQuery}) OR to_tsvector('simple', coalesce(m.title, '')) @@ to_tsquery('simple', ${tsQuery}))`
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
