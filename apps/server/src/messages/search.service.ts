import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type SearchPage = { ids: string[]; total: number };

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async searchMessages(
    userId: string,
    query: string,
    serverId?: string,
    channelId?: string,
    dmOnly?: boolean,
    limit = 25,
    offset = 0,
  ) {
    const take = Math.min(Math.max(1, limit), 50);
    const skip = Math.max(0, offset);
    const tsQuery = query
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w.replace(/[^\w]/g, ''))
      .filter(Boolean)
      .map((w) => `${w}:*`)
      .join(' & ');

    if (!tsQuery) return { results: [], total: 0 };

    let channelPage: SearchPage = { ids: [], total: 0 };
    let dmPage: SearchPage = { ids: [], total: 0 };

    if (!dmOnly) {
      const memberServerIds = await this.prisma.serverMember
        .findMany({ where: { userId }, select: { serverId: true } })
        .then((rows) => rows.map((r) => r.serverId));

      if (channelId) {
        const ch = await this.prisma.channel.findUnique({
          where: { id: channelId },
          select: { serverId: true },
        });
        if (ch && memberServerIds.includes(ch.serverId)) {
          channelPage = await this.searchInChannels(
            [channelId],
            tsQuery,
            take,
            skip,
          );
        }
      } else if (serverId) {
        if (memberServerIds.includes(serverId)) {
          const channels = await this.prisma.channel.findMany({
            where: { serverId },
            select: { id: true },
          });
          channelPage = await this.searchInChannels(
            channels.map((c) => c.id),
            tsQuery,
            take,
            skip,
          );
        }
      } else {
        const channels = await this.prisma.channel.findMany({
          where: { serverId: { in: memberServerIds } },
          select: { id: true },
        });
        if (channels.length > 0) {
          channelPage = await this.searchInChannels(
            channels.map((c) => c.id),
            tsQuery,
            take,
            skip,
          );
        }
      }
    }

    if (!channelId && !serverId) {
      const dmConvIds = await this.prisma.directConversationMember
        .findMany({ where: { userId }, select: { conversationId: true } })
        .then((rows) => rows.map((r) => r.conversationId));

      if (dmConvIds.length > 0) {
        dmPage = await this.searchInDms(dmConvIds, tsQuery, take, skip);
      }
    }

    const allIds = [...channelPage.ids, ...dmPage.ids];
    const total = channelPage.total + dmPage.total;

    if (allIds.length === 0) return { results: [], total };

    const fullMessages = await this.prisma.message.findMany({
      where: { id: { in: allIds } },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
        channel: { select: { id: true, name: true, serverId: true } },
        directConversation: { select: { id: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      results: fullMessages.map((m) => ({
        id: m.id,
        content: m.content,
        authorId: m.authorId,
        author: m.author,
        channelId: m.channelId,
        channel: m.channel,
        dmConversationId: m.directConversationId,
        createdAt: m.createdAt,
      })),
      total,
    };
  }

  private async searchInChannels(
    channelIds: string[],
    tsQuery: string,
    limit: number,
    offset: number,
  ): Promise<SearchPage> {
    if (channelIds.length === 0) return { ids: [], total: 0 };
    const [rows, countRows] = await Promise.all([
      this.prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM messages
        WHERE channel_id = ANY(${channelIds})
          AND deleted = false
          AND content IS NOT NULL
          AND to_tsvector('english', content) @@ to_tsquery('english', ${tsQuery})
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `,
      this.prisma.$queryRaw<{ count: bigint }[]>`
        SELECT count(*) FROM messages
        WHERE channel_id = ANY(${channelIds})
          AND deleted = false
          AND content IS NOT NULL
          AND to_tsvector('english', content) @@ to_tsquery('english', ${tsQuery})
      `,
    ]);
    return {
      ids: rows.map((r) => r.id),
      total: Number(countRows[0]?.count ?? 0),
    };
  }

  private async searchInDms(
    conversationIds: string[],
    tsQuery: string,
    limit: number,
    offset: number,
  ): Promise<SearchPage> {
    if (conversationIds.length === 0) return { ids: [], total: 0 };
    const [rows, countRows] = await Promise.all([
      this.prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM messages
        WHERE direct_conversation_id = ANY(${conversationIds})
          AND deleted = false
          AND content IS NOT NULL
          AND to_tsvector('english', content) @@ to_tsquery('english', ${tsQuery})
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `,
      this.prisma.$queryRaw<{ count: bigint }[]>`
        SELECT count(*) FROM messages
        WHERE direct_conversation_id = ANY(${conversationIds})
          AND deleted = false
          AND content IS NOT NULL
          AND to_tsvector('english', content) @@ to_tsquery('english', ${tsQuery})
      `,
    ]);
    return {
      ids: rows.map((r) => r.id),
      total: Number(countRows[0]?.count ?? 0),
    };
  }
}
