import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

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
  ) {
    const take = Math.min(Math.max(1, limit), 50);
    const tsQuery = query
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w.replace(/[^\w]/g, ''))
      .filter(Boolean)
      .join(' & ');

    if (!tsQuery) return { results: [] };

    const allIds: string[] = [];

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
          const channelResults = await this.searchInChannels([channelId], tsQuery, take);
          allIds.push(...channelResults);
        }
      } else if (serverId) {
        if (memberServerIds.includes(serverId)) {
          const channels = await this.prisma.channel.findMany({
            where: { serverId },
            select: { id: true },
          });
          const channelResults = await this.searchInChannels(
            channels.map((c) => c.id),
            tsQuery,
            take,
          );
          allIds.push(...channelResults);
        }
      } else {
        const channels = await this.prisma.channel.findMany({
          where: { serverId: { in: memberServerIds } },
          select: { id: true },
        });
        if (channels.length > 0) {
          const channelResults = await this.searchInChannels(
            channels.map((c) => c.id),
            tsQuery,
            take,
          );
          allIds.push(...channelResults);
        }
      }
    }

    if (!channelId && !serverId) {
      const dmConvIds = await this.prisma.directConversationMember
        .findMany({ where: { userId }, select: { conversationId: true } })
        .then((rows) => rows.map((r) => r.conversationId));

      if (dmConvIds.length > 0) {
        const dmResults = await this.searchInDms(dmConvIds, tsQuery, take);
        allIds.push(...dmResults);
      }
    }

    if (allIds.length === 0) return { results: [] };

    const fullMessages = await this.prisma.message.findMany({
      where: { id: { in: allIds } },
      include: {
        author: { select: { id: true, username: true, avatarUrl: true } },
        channel: { select: { id: true, name: true, serverId: true } },
        directConversation: { select: { id: true } },
      },
      orderBy: { createdAt: 'desc' },
      take,
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
    };
  }

  private async searchInChannels(
    channelIds: string[],
    tsQuery: string,
    limit: number,
  ): Promise<string[]> {
    if (channelIds.length === 0) return [];
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM messages
      WHERE channel_id = ANY(${channelIds})
        AND deleted = false
        AND content IS NOT NULL
        AND to_tsvector('english', content) @@ to_tsquery('english', ${tsQuery})
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
    return rows.map((r) => r.id);
  }

  private async searchInDms(
    conversationIds: string[],
    tsQuery: string,
    limit: number,
  ): Promise<string[]> {
    if (conversationIds.length === 0) return [];
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM messages
      WHERE direct_conversation_id = ANY(${conversationIds})
        AND deleted = false
        AND content IS NOT NULL
        AND to_tsvector('english', content) @@ to_tsquery('english', ${tsQuery})
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
    return rows.map((r) => r.id);
  }
}
