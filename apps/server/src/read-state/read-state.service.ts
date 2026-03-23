import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReadStateService {
  constructor(private readonly prisma: PrismaService) {}

  async getAllForUser(userId: string) {
    const [channelRows, dms] = await Promise.all([
      this.prisma.channelReadState.findMany({
        where: { userId },
        include: { channel: { select: { serverId: true } } },
      }),
      this.prisma.dmReadState.findMany({ where: { userId } }),
    ]);
    const channels = channelRows.map(({ channel, ...rs }) => ({
      ...rs,
      serverId: channel.serverId,
    }));
    return { channels, dms };
  }

  async ackChannel(userId: string, channelId: string) {
    await this.prisma.channelReadState.upsert({
      where: { userId_channelId: { userId, channelId } },
      update: { lastReadAt: new Date(), mentionCount: 0 },
      create: { userId, channelId, lastReadAt: new Date(), mentionCount: 0 },
    });
  }

  async ackDm(userId: string, conversationId: string) {
    await this.prisma.dmReadState.upsert({
      where: { userId_conversationId: { userId, conversationId } },
      update: { lastReadAt: new Date(), mentionCount: 0 },
      create: {
        userId,
        conversationId,
        lastReadAt: new Date(),
        mentionCount: 0,
      },
    });
  }

  async incrementMention(channelId: string, userIds: string[]) {
    if (userIds.length === 0) return;
    for (const userId of userIds) {
      await this.prisma.channelReadState.upsert({
        where: { userId_channelId: { userId, channelId } },
        update: { mentionCount: { increment: 1 } },
        create: {
          userId,
          channelId,
          lastReadAt: new Date(0),
          mentionCount: 1,
        },
      });
    }
  }

  async incrementDmMention(conversationId: string, userIds: string[]) {
    if (userIds.length === 0) return;
    for (const userId of userIds) {
      await this.prisma.dmReadState.upsert({
        where: { userId_conversationId: { userId, conversationId } },
        update: { mentionCount: { increment: 1 } },
        create: {
          userId,
          conversationId,
          lastReadAt: new Date(0),
          mentionCount: 1,
        },
      });
    }
  }

  /**
   * Parse @mentions from message content and return matching user IDs
   * that are members of the given server.
   *
   * Supports: @username, @DisplayName (single word), @"Display Name" (quoted, multi-word).
   * Matches against both username and displayName (case-insensitive).
   */
  async resolveMentions(
    content: string,
    serverId: string,
    excludeUserId: string,
  ): Promise<string[]> {
    const mentions = new Set<string>();

    const quotedPattern = /@"([^"]+)"/g;
    let match: RegExpExecArray | null;
    while ((match = quotedPattern.exec(content)) !== null) {
      mentions.add(match[1].toLowerCase());
    }

    const wordPattern = /@(\w+)/g;
    while ((match = wordPattern.exec(content)) !== null) {
      mentions.add(match[1].toLowerCase());
    }

    if (mentions.size === 0) return [];

    const members = await this.prisma.serverMember.findMany({
      where: { serverId },
      include: { user: { select: { id: true, username: true, displayName: true } } },
    });

    return members
      .filter(
        (m) =>
          m.userId !== excludeUserId &&
          (mentions.has(m.user.username.toLowerCase()) ||
            (m.user.displayName && mentions.has(m.user.displayName.toLowerCase()))),
      )
      .map((m) => m.userId);
  }
}
