import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { ChannelType } from '@prisma/client'
import { Permission } from '@chat/shared'
import { randomUUID } from 'node:crypto'
import { EventBusService } from '../events/event-bus.service'
import { LinkPreviewService } from '../messages/link-preview.service'
import { messageInclude as webhookMessageInclude } from '../messages/message-wire'
import { MessagesService } from '../messages/messages.service'
import { PrismaService } from '../prisma/prisma.service'
import { RolesService } from '../roles/roles.service'
import { AuditLogService } from '../servers/audit-log.service'

@Injectable()
export class WebhooksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly messages: MessagesService,
    private readonly events: EventBusService,
    private readonly auditLog: AuditLogService,
    private readonly linkPreviews: LinkPreviewService,
    private readonly roles: RolesService
  ) {}

  private async requireTextChannel(channelId: string) {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId }
    })
    if (!channel) {
      throw new NotFoundException('Channel not found')
    }
    if (channel.type !== ChannelType.text) {
      throw new ForbiddenException('Webhooks are only available in text channels')
    }
    return channel
  }

  async createWebhook(channelId: string, userId: string, name: string) {
    const channel = await this.requireTextChannel(channelId)
    await this.roles.requirePermission(channel.serverId, userId, Permission.MANAGE_WEBHOOKS)
    const trimmed = name.trim()
    if (!trimmed) {
      throw new BadRequestException('Name is required')
    }
    const webhook = await this.prisma.webhook.create({
      data: {
        channelId,
        name: trimmed,
        token: randomUUID(),
        createdById: userId
      }
    })
    await this.auditLog.log(channel.serverId, userId, 'webhook.create', 'webhook', webhook.id, trimmed)
    return webhook
  }

  async getWebhooks(channelId: string, userId: string) {
    const channel = await this.requireTextChannel(channelId)
    await this.roles.requirePermission(channel.serverId, userId, Permission.MANAGE_WEBHOOKS)
    return this.prisma.webhook.findMany({
      where: { channelId },
      select: {
        id: true,
        channelId: true,
        name: true,
        token: true,
        avatarUrl: true,
        createdById: true,
        createdAt: true
      },
      orderBy: { createdAt: 'asc' }
    })
  }

  async deleteWebhook(webhookId: string, userId: string) {
    const webhook = await this.prisma.webhook.findUnique({
      where: { id: webhookId }
    })
    if (!webhook) {
      throw new NotFoundException('Webhook not found')
    }
    const channel = await this.requireTextChannel(webhook.channelId)
    await this.roles.requirePermission(channel.serverId, userId, Permission.MANAGE_WEBHOOKS)
    await this.prisma.webhook.delete({ where: { id: webhookId } })
    await this.auditLog.log(channel.serverId, userId, 'webhook.delete', 'webhook', webhookId, webhook.name)
  }

  async executeWebhook(token: string, content?: string, username?: string, avatarUrl?: string, embeds?: any[]) {
    const webhook = await this.prisma.webhook.findUnique({
      where: { token }
    })
    if (!webhook) {
      throw new NotFoundException('Webhook not found')
    }
    const channel = await this.requireTextChannel(webhook.channelId)

    const trimmed = content?.trim()
    const hasEmbeds = !!embeds?.length
    if (!trimmed && !hasEmbeds) {
      throw new BadRequestException('Content or embeds are required')
    }

    const resolvedName = username?.trim() || webhook.name
    const resolvedAvatar = avatarUrl?.trim() || webhook.avatarUrl

    const created = await this.prisma.message.create({
      data: {
        channelId: webhook.channelId,
        authorId: webhook.createdById,
        content: trimmed ?? null,
        webhookId: webhook.id,
        webhookName: resolvedName,
        webhookAvatarUrl: resolvedAvatar,
        embeds: hasEmbeds ? embeds : undefined
      },
      include: webhookMessageInclude
    })

    const wire = this.messages.mapToWire(created)
    const wireWithWebhook = {
      ...wire,
      webhook: {
        name: resolvedName,
        avatarUrl: resolvedAvatar
      }
    }
    this.events.emit('webhook:message', {
      channelId: webhook.channelId,
      serverId: channel.serverId,
      webhookName: resolvedName,
      message: wireWithWebhook
    })

    if (!trimmed) return wireWithWebhook

    void this.linkPreviews
      .generatePreviews(created.id, trimmed)
      .then((previews) => {
        if (previews.length > 0) {
          this.events.emit('webhook:link-previews', {
            channelId: webhook.channelId,
            messageId: created.id,
            linkPreviews: previews
          })
        }
      })
      .catch(() => {})

    return wireWithWebhook
  }
}
