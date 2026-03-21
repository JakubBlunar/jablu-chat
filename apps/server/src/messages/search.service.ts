import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MessagesService } from './messages.service';

@Injectable()
export class SearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly messages: MessagesService,
  ) {}

  async searchMessages(
    userId: string,
    query: string,
    serverId?: string,
    channelId?: string,
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

    const memberServerIds = await this.prisma.serverMember
      .findMany({
        where: { userId },
        select: { serverId: true },
      })
      .then((rows) => rows.map((r) => r.serverId));

    if (memberServerIds.length === 0) return { results: [] };

    const whereChannelIds: string[] = [];

    if (channelId) {
      const ch = await this.prisma.channel.findUnique({
        where: { id: channelId },
        select: { serverId: true },
      });
      if (ch && memberServerIds.includes(ch.serverId)) {
        whereChannelIds.push(channelId);
      }
    } else if (serverId) {
      if (memberServerIds.includes(serverId)) {
        const channels = await this.prisma.channel.findMany({
          where: { serverId },
          select: { id: true },
        });
        whereChannelIds.push(...channels.map((c) => c.id));
      }
    } else {
      const channels = await this.prisma.channel.findMany({
        where: { serverId: { in: memberServerIds } },
        select: { id: true },
      });
      whereChannelIds.push(...channels.map((c) => c.id));
    }

    if (whereChannelIds.length === 0) return { results: [] };

    const rows = await this.prisma.$queryRaw<
      { id: string; channel_id: string; content: string; author_id: string; created_at: Date }[]
    >`
      SELECT id, channel_id, content, author_id, created_at
      FROM messages
      WHERE channel_id = ANY(${whereChannelIds})
        AND deleted = false
        AND content IS NOT NULL
        AND to_tsvector('english', content) @@ to_tsquery('english', ${tsQuery})
      ORDER BY created_at DESC
      LIMIT ${take}
    `;

    const messageIds = rows.map((r) => r.id);
    if (messageIds.length === 0) return { results: [] };

    const fullMessages = await this.prisma.message.findMany({
      where: { id: { in: messageIds } },
      include: {
        author: { select: { id: true, username: true, avatarUrl: true } },
        channel: { select: { id: true, name: true, serverId: true } },
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
        createdAt: m.createdAt,
      })),
    };
  }
}
