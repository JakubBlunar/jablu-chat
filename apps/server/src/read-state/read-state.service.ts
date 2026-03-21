import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReadStateService {
  constructor(private readonly prisma: PrismaService) {}

  async getAllForUser(userId: string) {
    const [channels, dms] = await Promise.all([
      this.prisma.channelReadState.findMany({ where: { userId } }),
      this.prisma.dmReadState.findMany({ where: { userId } }),
    ]);
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
   * Parse @username mentions from message content and return matching user IDs
   * that are members of the given server.
   */
  async resolveMentions(
    content: string,
    serverId: string,
    excludeUserId: string,
  ): Promise<string[]> {
    const mentionPattern = /@(\w+)/g;
    const usernames = new Set<string>();
    let match: RegExpExecArray | null;
    while ((match = mentionPattern.exec(content)) !== null) {
      usernames.add(match[1].toLowerCase());
    }
    if (usernames.size === 0) return [];

    const members = await this.prisma.serverMember.findMany({
      where: { serverId },
      include: { user: { select: { id: true, username: true } } },
    });

    return members
      .filter(
        (m) =>
          m.userId !== excludeUserId &&
          usernames.has(m.user.username.toLowerCase()),
      )
      .map((m) => m.userId);
  }
}
