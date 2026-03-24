import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ChannelType, Prisma, ServerRole } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { EventBusService } from '../events/event-bus.service';
import { LinkPreviewService } from '../messages/link-preview.service';
import { MessagesService } from '../messages/messages.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../servers/audit-log.service';

const authorSelect = {
  id: true,
  username: true,
  displayName: true,
  avatarUrl: true,
} as const;

const webhookMessageInclude = {
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
  webhook: { select: { name: true, avatarUrl: true } },
} satisfies Prisma.MessageInclude;

@Injectable()
export class WebhooksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly messages: MessagesService,
    private readonly events: EventBusService,
    private readonly auditLog: AuditLogService,
    private readonly linkPreviews: LinkPreviewService,
  ) {}

  private async requireTextChannel(channelId: string) {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
    });
    if (!channel) {
      throw new NotFoundException('Channel not found');
    }
    if (channel.type !== ChannelType.text) {
      throw new ForbiddenException(
        'Webhooks are only available in text channels',
      );
    }
    return channel;
  }

  private async requireServerMember(channelId: string, userId: string) {
    const channel = await this.requireTextChannel(channelId);
    const membership = await this.prisma.serverMember.findUnique({
      where: {
        userId_serverId: { userId, serverId: channel.serverId },
      },
    });
    if (!membership) {
      throw new ForbiddenException('You are not a member of this server');
    }
    return channel;
  }

  private async requireAdminOrOwnerForServer(
    serverId: string,
    userId: string,
  ) {
    const server = await this.prisma.server.findUnique({
      where: { id: serverId },
    });
    if (!server) {
      throw new NotFoundException('Server not found');
    }
    if (server.ownerId === userId) {
      return server;
    }
    const membership = await this.prisma.serverMember.findUnique({
      where: {
        userId_serverId: { userId, serverId },
      },
    });
    if (!membership) {
      throw new ForbiddenException('You are not a member of this server');
    }
    if (
      membership.role !== ServerRole.admin &&
      membership.role !== ServerRole.owner
    ) {
      throw new ForbiddenException('Insufficient permissions');
    }
    return server;
  }

  async createWebhook(channelId: string, userId: string, name: string) {
    const channel = await this.requireTextChannel(channelId);
    await this.requireAdminOrOwnerForServer(channel.serverId, userId);
    const trimmed = name.trim();
    if (!trimmed) {
      throw new BadRequestException('Name is required');
    }
    const webhook = await this.prisma.webhook.create({
      data: {
        channelId,
        name: trimmed,
        token: randomUUID(),
        createdById: userId,
      },
    });
    await this.auditLog.log(channel.serverId, userId, 'webhook.create', 'webhook', webhook.id, trimmed);
    return webhook;
  }

  async getWebhooks(channelId: string, userId: string) {
    await this.requireServerMember(channelId, userId);
    return this.prisma.webhook.findMany({
      where: { channelId },
      select: {
        id: true,
        channelId: true,
        name: true,
        token: true,
        avatarUrl: true,
        createdById: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async deleteWebhook(webhookId: string, userId: string) {
    const webhook = await this.prisma.webhook.findUnique({
      where: { id: webhookId },
    });
    if (!webhook) {
      throw new NotFoundException('Webhook not found');
    }
    const channel = await this.requireTextChannel(webhook.channelId);
    await this.requireAdminOrOwnerForServer(channel.serverId, userId);
    await this.prisma.webhook.delete({ where: { id: webhookId } });
    await this.auditLog.log(channel.serverId, userId, 'webhook.delete', 'webhook', webhookId, webhook.name);
  }

  async executeWebhook(
    token: string,
    content: string,
    username?: string,
    avatarUrl?: string,
  ) {
    const webhook = await this.prisma.webhook.findUnique({
      where: { token },
    });
    if (!webhook) {
      throw new NotFoundException('Webhook not found');
    }
    await this.requireTextChannel(webhook.channelId);

    const trimmed = content.trim();
    if (!trimmed) {
      throw new BadRequestException('Content is required');
    }

    const resolvedName = username?.trim() || webhook.name;
    const resolvedAvatar = avatarUrl?.trim() || webhook.avatarUrl;

    const created = await this.prisma.message.create({
      data: {
        channelId: webhook.channelId,
        authorId: webhook.createdById,
        content: trimmed,
        webhookId: webhook.id,
        webhookName: resolvedName,
        webhookAvatarUrl: resolvedAvatar,
      },
      include: webhookMessageInclude,
    });

    const wire = this.messages.mapToWire(created);
    const wireWithWebhook = {
      ...wire,
      webhook: {
        name: resolvedName,
        avatarUrl: resolvedAvatar,
      },
    };
    this.events.emit('webhook:message', {
      channelId: webhook.channelId,
      message: wireWithWebhook,
    });

    void this.linkPreviews
      .generatePreviews(created.id, trimmed)
      .then((previews) => {
        if (previews.length > 0) {
          this.events.emit('webhook:link-previews', {
            channelId: webhook.channelId,
            messageId: created.id,
            linkPreviews: previews,
          });
        }
      })
      .catch(() => {});

    return wireWithWebhook;
  }
}
