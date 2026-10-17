import { BadRequestException, Injectable } from '@nestjs/common'
import { Prisma } from '../prisma-client'
import { hasPermission, Permission } from '@chat/shared'
import { PrismaService } from '../prisma/prisma.service'
import { RolesService } from '../roles/roles.service'

interface ParsedQuery {
  text: string
  hasImage: boolean
  hasFile: boolean
  hasVideo: boolean
  hasAttachment: boolean
  hasLink: boolean
  hasPoll: boolean
  hasPinned: boolean
  fromUsername: string | null
  location: 'thread' | 'root' | null
  tag: string | null
  after: Date | null
  before: Date | null
}

export function parseSearchQuery(raw: string): ParsedQuery {
  const filters: ParsedQuery = {
    text: '',
    hasImage: false,
    hasFile: false,
    hasVideo: false,
    hasAttachment: false,
    hasLink: false,
    hasPoll: false,
    hasPinned: false,
    fromUsername: null,
    location: null,
    tag: null,
    after: null,
    before: null
  }
  const text = raw.replace(
    /(?<!\S)(has|from|in|tag|after|before):(?:"([^"]*)"(?=\s|$)|(\S*))/gi,
    (_, key: string, quoted: string | undefined, word: string | undefined) => {
      const value = quoted ?? word ?? ''
      if (!value.trim() || (quoted === undefined && value.includes('"'))) {
        throw new BadRequestException('Complete the search filter before searching')
      }
      switch (key.toLowerCase()) {
        case 'has':
          switch (value.toLowerCase()) {
            case 'image':
              filters.hasImage = true
              break
            case 'file':
              filters.hasFile = true
              break
            case 'video':
              filters.hasVideo = true
              break
            case 'attachment':
              filters.hasAttachment = true
              break
            case 'link':
              filters.hasLink = true
              break
            case 'poll':
              filters.hasPoll = true
              break
            case 'pin':
            case 'pinned':
              filters.hasPinned = true
              break
            default:
              throw new BadRequestException(`Unsupported search filter: has:${value}`)
          }
          break
        case 'from':
          filters.fromUsername = value.replace(/^@/, '')
          if (!filters.fromUsername) throw new BadRequestException('Specify a sender after from:')
          break
        case 'in': {
          const location = value.toLowerCase()
          if (location !== 'thread' && location !== 'root') throw new BadRequestException('Use in:thread or in:root')
          filters.location = location
          break
        }
        case 'tag':
          filters.tag = value
          break
        case 'after':
        case 'before': {
          const date = new Date(`${value}T00:00:00.000Z`)
          if (
            !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
            !Number.isFinite(date.getTime()) ||
            date.toISOString().slice(0, 10) !== value
          ) {
            throw new BadRequestException('Search dates must be valid dates in YYYY-MM-DD format')
          }
          if (key.toLowerCase() === 'after') filters.after = date
          else filters.before = date
          break
        }
      }
      return ''
    }
  )
  if (filters.after && filters.before && filters.after >= filters.before)
    throw new BadRequestException('The after date must be earlier than the before date')
  filters.text = text.trim()
  return filters
}

@Injectable()
export class SearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly roles: RolesService
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
      .map((word) => word.replace(/[^\w\u00C0-\u024F\u0400-\u04FF\u3000-\u9FFF]/g, ''))
      .filter(Boolean)
      .map((word) => `${word}:*`)
      .join(' & ')
    const hasFilters = Object.entries(parsed).some(([key, value]) => key !== 'text' && !!value)
    if (!tsQuery && !hasFilters) return { results: [], total: 0 }

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

    let channelIds: string[] = []
    let conversationIds: string[] = []
    if (conversationId) {
      const member = await this.prisma.directConversationMember.findFirst({ where: { conversationId, userId } })
      if (!member) return { results: [], total: 0 }
      conversationIds = [conversationId]
    } else {
      if (!dmOnly) {
        const memberships = await this.prisma.serverMember.findMany({ where: { userId }, select: { serverId: true } })
        const serverIds = memberships.map((member) => member.serverId)
        if (channelId) {
          const channel = await this.prisma.channel.findUnique({ where: { id: channelId }, select: { serverId: true } })
          if (channel && serverIds.includes(channel.serverId)) {
            const visible = await this.getVisibleChannelIds(channel.serverId, userId)
            if (visible.includes(channelId)) channelIds = [channelId]
          }
        } else if (serverId) {
          if (serverIds.includes(serverId)) channelIds = await this.getVisibleChannelIds(serverId, userId)
        } else {
          const visible = await this.roles.getVisibleChannelIdsForServers(userId, serverIds)
          channelIds = [...visible.values()].flat()
        }
      }
      if (!channelId && !serverId) {
        const memberships = await this.prisma.directConversationMember.findMany({
          where: { userId },
          select: { conversationId: true }
        })
        conversationIds = memberships.map((member) => member.conversationId)
      }
    }
    if (channelIds.length === 0 && conversationIds.length === 0) return { results: [], total: 0 }

    const clauses = this.buildFilterClauses({ ...parsed, fromUserId })
    const textCondition = tsQuery
      ? Prisma.sql`AND (to_tsvector('simple', coalesce(m.content, '')) @@ to_tsquery('simple', ${tsQuery})
          OR to_tsvector('simple', coalesce(m.title, '')) @@ to_tsquery('simple', ${tsQuery}))`
      : Prisma.empty
    const where = Prisma.sql`
      WHERE (m.channel_id = ANY(${channelIds}::text[]) OR m.direct_conversation_id = ANY(${conversationIds}::text[]))
        AND m.deleted = false ${textCondition} ${Prisma.join(clauses, ' ')}`
    const [rows, counts] = await Promise.all([
      this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT m.id FROM messages m ${where}
        ORDER BY m.created_at DESC, m.id DESC LIMIT ${take} OFFSET ${skip}`),
      this.prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`SELECT count(*) FROM messages m ${where}`)
    ])
    const total = Number(counts[0]?.count ?? 0)
    if (rows.length === 0) return { results: [], total }
    return this.hydrateResults(
      rows.map((row) => row.id),
      total
    )
  }

  private buildFilterClauses(filters: ParsedQuery & { fromUserId: string | null }): Prisma.Sql[] {
    const clauses: Prisma.Sql[] = [Prisma.empty]
    if (filters.fromUserId) clauses.push(Prisma.sql`AND m.author_id = ${filters.fromUserId}`)
    if (filters.hasPinned) clauses.push(Prisma.sql`AND m.pinned = true`)
    if (filters.hasImage)
      clauses.push(
        Prisma.sql`AND EXISTS (SELECT 1 FROM attachments a WHERE a.message_id = m.id AND a.type IN ('image', 'gif'))`
      )
    if (filters.hasFile)
      clauses.push(Prisma.sql`AND EXISTS (SELECT 1 FROM attachments a WHERE a.message_id = m.id AND a.type = 'file')`)
    if (filters.hasVideo)
      clauses.push(Prisma.sql`AND EXISTS (SELECT 1 FROM attachments a WHERE a.message_id = m.id AND a.type = 'video')`)
    if (filters.hasAttachment)
      clauses.push(Prisma.sql`AND EXISTS (SELECT 1 FROM attachments a WHERE a.message_id = m.id)`)
    if (filters.hasLink)
      clauses.push(
        Prisma.sql`AND (EXISTS (SELECT 1 FROM link_previews lp WHERE lp.message_id = m.id) OR m.content ~* 'https?://[^[:space:]<>]+')`
      )
    if (filters.hasPoll) clauses.push(Prisma.sql`AND EXISTS (SELECT 1 FROM polls p WHERE p.message_id = m.id)`)
    if (filters.location === 'thread') clauses.push(Prisma.sql`AND m.thread_parent_id IS NOT NULL`)
    if (filters.location === 'root') clauses.push(Prisma.sql`AND m.thread_parent_id IS NULL`)
    if (filters.tag)
      clauses.push(Prisma.sql`AND EXISTS (
      SELECT 1 FROM forum_post_tags pt JOIN forum_tags ft ON ft.id = pt.tag_id
      WHERE pt.message_id = coalesce(m.thread_parent_id, m.id) AND lower(ft.name) = lower(${filters.tag}))`)
    if (filters.after) clauses.push(Prisma.sql`AND m.created_at >= ${filters.after}`)
    if (filters.before) clauses.push(Prisma.sql`AND m.created_at < ${filters.before}`)
    return clauses
  }

  private async getVisibleChannelIds(serverId: string, userId: string) {
    const permissions = await this.roles.getAllChannelPermissions(serverId, userId)
    return Object.entries(permissions)
      .filter(([, value]) => hasPermission(value, Permission.VIEW_CHANNEL))
      .map(([id]) => id)
  }

  private async hydrateResults(ids: string[], total: number) {
    const messages = await this.prisma.message.findMany({
      where: { id: { in: ids }, deleted: false },
      include: {
        author: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
        channel: { select: { id: true, name: true, serverId: true, type: true } },
        attachments: {
          select: {
            id: true,
            messageId: true,
            filename: true,
            url: true,
            type: true,
            mimeType: true,
            sizeBytes: true,
            width: true,
            height: true,
            thumbnailUrl: true
          }
        }
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]
    })
    return {
      results: messages.map((message) => ({
        id: message.id,
        content: message.content,
        title: message.title,
        threadParentId: message.threadParentId,
        authorId: message.authorId,
        author: message.author,
        channelId: message.channelId,
        channel: message.channel,
        dmConversationId: message.directConversationId,
        createdAt: message.createdAt,
        attachments: message.attachments
      })),
      total
    }
  }
}
