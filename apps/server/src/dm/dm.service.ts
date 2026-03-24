import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const memberSelect = {
  userId: true,
  user: {
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      bio: true,
      status: true,
      createdAt: true,
    },
  },
} satisfies Prisma.DirectConversationMemberSelect;

const authorSelect = {
  id: true,
  username: true,
  displayName: true,
  avatarUrl: true,
} as const;

const messageInclude = {
  author: { select: authorSelect },
  attachments: true,
  reactions: { select: { emoji: true, userId: true, isCustom: true } },
  replyTo: {
    select: {
      id: true,
      content: true,
      author: { select: authorSelect },
    },
  },
  linkPreviews: {
    select: {
      id: true,
      url: true,
      title: true,
      description: true,
      imageUrl: true,
      siteName: true,
    },
  },
} satisfies Prisma.MessageInclude;

type MessageWithRelations = Prisma.MessageGetPayload<{
  include: typeof messageInclude;
}>;

@Injectable()
export class DmService {
  constructor(private readonly prisma: PrismaService) {}

  private groupReactions(
    reactions: { emoji: string; userId: string; isCustom: boolean }[],
  ) {
    const map = new Map<
      string,
      { emoji: string; count: number; userIds: string[]; isCustom: boolean }
    >();
    for (const r of reactions) {
      const cur = map.get(r.emoji) ?? {
        emoji: r.emoji,
        count: 0,
        userIds: [] as string[],
        isCustom: r.isCustom,
      };
      cur.count += 1;
      cur.userIds.push(r.userId);
      map.set(r.emoji, cur);
    }
    return [...map.values()];
  }

  mapToWire(m: MessageWithRelations) {
    const { reactions, ...rest } = m;
    return { ...rest, reactions: this.groupReactions(reactions) };
  }

  async getConversationReadStates(conversationId: string, userId: string) {
    await this.requireMembership(conversationId, userId);
    const states = await this.prisma.dmReadState.findMany({
      where: { conversationId },
      select: { userId: true, lastReadAt: true },
    });
    return states.map((s) => ({
      userId: s.userId,
      lastReadAt: s.lastReadAt.toISOString(),
    }));
  }

  async requireMembership(conversationId: string, userId: string) {
    const member = await this.prisma.directConversationMember.findUnique({
      where: {
        conversationId_userId: { conversationId, userId },
      },
    });
    if (!member) {
      throw new ForbiddenException('You are not a member of this conversation');
    }
    return member;
  }

  async findOrCreateDm(currentUserId: string, recipientId: string) {
    if (currentUserId === recipientId) {
      throw new BadRequestException('Cannot create a DM with yourself');
    }

    const recipient = await this.prisma.user.findUnique({
      where: { id: recipientId },
    });
    if (!recipient) {
      throw new NotFoundException('User not found');
    }

    const existing = await this.prisma.directConversation.findFirst({
      where: {
        isGroup: false,
        AND: [
          { members: { some: { userId: currentUserId } } },
          { members: { some: { userId: recipientId } } },
        ],
      },
      include: { members: { select: memberSelect } },
    });

    if (existing) {
      await this.prisma.directConversationMember.updateMany({
        where: { conversationId: existing.id, userId: currentUserId, closedAt: { not: null } },
        data: { closedAt: null },
      });
      return this.toConversationWire(existing);
    }

    const created = await this.prisma.directConversation.create({
      data: {
        isGroup: false,
        members: {
          create: [{ userId: currentUserId }, { userId: recipientId }],
        },
      },
      include: { members: { select: memberSelect } },
    });

    return this.toConversationWire(created);
  }

  async createGroupDm(
    currentUserId: string,
    memberIds: string[],
    groupName?: string,
  ) {
    const uniqueIds = [...new Set([currentUserId, ...memberIds])];
    if (uniqueIds.length < 3) {
      throw new BadRequestException(
        'Group DMs require at least 3 participants',
      );
    }
    if (uniqueIds.length > 10) {
      throw new BadRequestException(
        'Group DMs are limited to 10 participants',
      );
    }

    const users = await this.prisma.user.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true },
    });
    if (users.length !== uniqueIds.length) {
      throw new BadRequestException('One or more users not found');
    }

    const created = await this.prisma.directConversation.create({
      data: {
        isGroup: true,
        groupName: groupName?.trim() || null,
        members: {
          create: uniqueIds.map((id) => ({ userId: id })),
        },
      },
      include: { members: { select: memberSelect } },
    });

    return this.toConversationWire(created);
  }

  async closeConversation(conversationId: string, userId: string) {
    await this.requireMembership(conversationId, userId);
    await this.prisma.directConversationMember.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { closedAt: new Date() },
    });
  }

  async openConversation(conversationId: string, userId: string) {
    await this.prisma.directConversationMember.updateMany({
      where: { conversationId, userId, closedAt: { not: null } },
      data: { closedAt: null },
    });
  }

  async getConversations(userId: string) {
    const conversations = await this.prisma.directConversation.findMany({
      where: { members: { some: { userId, closedAt: null } } },
      include: {
        members: { select: memberSelect },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            content: true,
            authorId: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return conversations
      .map((c) => {
        const lastMessage = c.messages[0] ?? null;
        return {
          ...this.toConversationWire(c),
          lastMessage,
        };
      })
      .sort((a, b) => {
        const aTime = a.lastMessage?.createdAt ?? new Date(a.createdAt);
        const bTime = b.lastMessage?.createdAt ?? new Date(b.createdAt);
        return new Date(bTime).getTime() - new Date(aTime).getTime();
      });
  }

  async getConversation(conversationId: string, userId: string) {
    await this.requireMembership(conversationId, userId);
    const conversation = await this.prisma.directConversation.findUnique({
      where: { id: conversationId },
      include: { members: { select: memberSelect } },
    });
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }
    return this.toConversationWire(conversation);
  }

  async getMessages(
    conversationId: string,
    userId: string,
    cursor?: string,
    limit = 50,
  ) {
    await this.requireMembership(conversationId, userId);
    const take = Math.min(Math.max(1, limit), 100);

    const baseWhere: Prisma.MessageWhereInput = {
      directConversationId: conversationId,
      deleted: false,
    };

    let where: Prisma.MessageWhereInput = baseWhere;
    if (cursor) {
      const cursorMsg = await this.prisma.message.findFirst({
        where: {
          id: cursor,
          directConversationId: conversationId,
          deleted: false,
        },
      });
      if (!cursorMsg) {
        throw new BadRequestException('Invalid cursor');
      }
      where = {
        AND: [
          baseWhere,
          {
            OR: [
              { createdAt: { lt: cursorMsg.createdAt } },
              {
                AND: [
                  { createdAt: cursorMsg.createdAt },
                  { id: { lt: cursorMsg.id } },
                ],
              },
            ],
          },
        ],
      };
    }

    const rows = await this.prisma.message.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      include: messageInclude,
    });

    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;
    return {
      messages: page.map((m) => this.mapToWire(m)),
      hasMore,
    };
  }

  async getMessagesAround(
    conversationId: string,
    userId: string,
    messageId: string,
    limit = 50,
  ) {
    await this.requireMembership(conversationId, userId);
    const half = Math.floor(Math.min(Math.max(1, limit), 100) / 2);

    const anchor = await this.prisma.message.findFirst({
      where: { id: messageId, directConversationId: conversationId, deleted: false },
    });
    if (!anchor) {
      return this.getMessages(conversationId, userId, undefined, limit);
    }

    const [before, after] = await Promise.all([
      this.prisma.message.findMany({
        where: {
          directConversationId: conversationId,
          deleted: false,
          OR: [
            { createdAt: { lt: anchor.createdAt } },
            { AND: [{ createdAt: anchor.createdAt }, { id: { lt: anchor.id } }] },
          ],
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: half,
        include: messageInclude,
      }),
      this.prisma.message.findMany({
        where: {
          directConversationId: conversationId,
          deleted: false,
          OR: [
            { createdAt: { gt: anchor.createdAt } },
            { AND: [{ createdAt: anchor.createdAt }, { id: { gt: anchor.id } }] },
          ],
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: half,
        include: messageInclude,
      }),
    ]);

    const anchorRow = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: messageInclude,
    });

    const allDesc = [
      ...after.reverse(),
      ...(anchorRow ? [anchorRow] : []),
      ...before,
    ];

    return {
      messages: allDesc.map((m) => this.mapToWire(m)),
      hasMore: before.length >= half,
      hasNewer: after.length >= half,
    };
  }

  async createMessage(
    conversationId: string,
    userId: string,
    content?: string,
    replyToId?: string,
    attachmentIds?: string[],
  ) {
    await this.requireMembership(conversationId, userId);

    const trimmed = content?.trim();
    const hasAttachments = !!attachmentIds?.length;
    if (!trimmed && !hasAttachments) {
      throw new BadRequestException(
        'Message must have content or at least one attachment',
      );
    }

    if (replyToId) {
      const parent = await this.prisma.message.findFirst({
        where: { id: replyToId, directConversationId: conversationId },
      });
      if (!parent) {
        throw new BadRequestException('Invalid replyToId');
      }
    }

    if (hasAttachments) {
      const found = await this.prisma.attachment.findMany({
        where: {
          id: { in: attachmentIds },
          uploaderId: userId,
          messageId: null,
        },
        select: { id: true },
      });
      if (found.length !== attachmentIds!.length) {
        throw new BadRequestException(
          'One or more attachments were not found or do not belong to you',
        );
      }
    }

    const [created] = await Promise.all([
      this.prisma.message.create({
        data: {
          directConversationId: conversationId,
          authorId: userId,
          content: trimmed ?? null,
          replyToId: replyToId ?? undefined,
          attachments: hasAttachments
            ? { connect: attachmentIds!.map((id) => ({ id })) }
            : undefined,
        },
        include: messageInclude,
      }),
      this.prisma.directConversationMember.updateMany({
        where: { conversationId, closedAt: { not: null } },
        data: { closedAt: null },
      }),
    ]);

    return this.mapToWire(created);
  }

  async editMessage(
    conversationId: string,
    messageId: string,
    userId: string,
    content: string,
  ) {
    await this.requireMembership(conversationId, userId);
    const message = await this.prisma.message.findFirst({
      where: { id: messageId, directConversationId: conversationId },
    });
    if (!message) throw new NotFoundException('Message not found');
    if (message.deleted) {
      throw new ForbiddenException('Cannot edit a deleted message');
    }
    if (message.authorId !== userId) {
      throw new ForbiddenException('You can only edit your own messages');
    }

    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: { content: content.trim(), editedAt: new Date() },
      include: messageInclude,
    });

    return this.mapToWire(updated);
  }

  async deleteMessage(
    conversationId: string,
    messageId: string,
    userId: string,
  ) {
    await this.requireMembership(conversationId, userId);
    const message = await this.prisma.message.findFirst({
      where: { id: messageId, directConversationId: conversationId },
    });
    if (!message) throw new NotFoundException('Message not found');
    if (message.deleted) return { id: messageId, deleted: true };
    if (message.authorId !== userId) {
      throw new ForbiddenException('You can only delete your own messages');
    }

    await this.prisma.message.update({
      where: { id: messageId },
      data: { deleted: true, content: null },
    });

    return { id: messageId, deleted: true };
  }

  async getConversationMemberIds(conversationId: string): Promise<string[]> {
    const members = await this.prisma.directConversationMember.findMany({
      where: { conversationId },
      select: { userId: true },
    });
    return members.map((m) => m.userId);
  }

  private toConversationWire(
    c: Prisma.DirectConversationGetPayload<{
      include: { members: { select: typeof memberSelect } };
    }>,
  ) {
    return {
      id: c.id,
      isGroup: c.isGroup,
      groupName: c.groupName,
      createdAt: c.createdAt.toISOString(),
      members: c.members.map((m) => ({
        userId: m.user.id,
        username: m.user.username,
        avatarUrl: m.user.avatarUrl,
        bio: m.user.bio,
        status: m.user.status,
        createdAt: m.user.createdAt.toISOString(),
      })),
    };
  }
}
