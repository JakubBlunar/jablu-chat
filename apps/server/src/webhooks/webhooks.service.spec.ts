import { Test, TestingModule } from '@nestjs/testing'
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { WebhooksService } from './webhooks.service'
import { PrismaService } from '../prisma/prisma.service'
import { MessagesService } from '../messages/messages.service'
import { EventBusService } from '../events/event-bus.service'
import { AuditLogService } from '../servers/audit-log.service'
import { LinkPreviewService } from '../messages/link-preview.service'
import { RolesService } from '../roles/roles.service'
import { createMockPrismaService, MockPrismaService } from '../__mocks__/prisma.mock'

describe('WebhooksService', () => {
  let service: WebhooksService
  let prisma: MockPrismaService
  let messages: { mapToWire: jest.Mock }
  let events: { emit: jest.Mock }
  let auditLog: { log: jest.Mock }
  let linkPreviews: { generatePreviews: jest.Mock }
  let roles: { requirePermission: jest.Mock }

  const serverId = 'server-1'
  const channelId = 'ch-1'
  const userId = 'user-1'
  const textChannel = { id: channelId, serverId, type: 'text' }

  beforeEach(async () => {
    prisma = createMockPrismaService()
    messages = { mapToWire: jest.fn((m) => ({ ...m, reactions: [] })) }
    events = { emit: jest.fn() }
    auditLog = { log: jest.fn().mockResolvedValue(undefined) }
    linkPreviews = { generatePreviews: jest.fn().mockResolvedValue([]) }
    roles = { requirePermission: jest.fn().mockResolvedValue(0n) }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhooksService,
        { provide: PrismaService, useValue: prisma },
        { provide: MessagesService, useValue: messages },
        { provide: EventBusService, useValue: events },
        { provide: AuditLogService, useValue: auditLog },
        { provide: LinkPreviewService, useValue: linkPreviews },
        { provide: RolesService, useValue: roles },
      ],
    }).compile()

    service = module.get(WebhooksService)
  })

  describe('createWebhook', () => {
    it('creates a webhook in a text channel', async () => {
      prisma.channel.findUnique.mockResolvedValue(textChannel)
      prisma.webhook.create.mockResolvedValue({
        id: 'wh-1',
        channelId,
        name: 'Bot',
        token: 'tok-1',
        createdById: userId,
      })

      const result = await service.createWebhook(channelId, userId, 'Bot')
      expect(result.name).toBe('Bot')
      expect(roles.requirePermission).toHaveBeenCalled()
      expect(auditLog.log).toHaveBeenCalled()
    })

    it('throws when channel not found', async () => {
      prisma.channel.findUnique.mockResolvedValue(null)
      await expect(service.createWebhook(channelId, userId, 'Bot')).rejects.toThrow(NotFoundException)
    })

    it('throws when channel is not text', async () => {
      prisma.channel.findUnique.mockResolvedValue({ ...textChannel, type: 'voice' })
      await expect(service.createWebhook(channelId, userId, 'Bot')).rejects.toThrow(ForbiddenException)
    })

    it('throws when name is empty', async () => {
      prisma.channel.findUnique.mockResolvedValue(textChannel)
      await expect(service.createWebhook(channelId, userId, '   ')).rejects.toThrow(BadRequestException)
    })
  })

  describe('getWebhooks', () => {
    it('returns webhooks list', async () => {
      prisma.channel.findUnique.mockResolvedValue(textChannel)
      prisma.webhook.findMany.mockResolvedValue([{ id: 'wh-1', name: 'Bot' }])

      const result = await service.getWebhooks(channelId, userId)
      expect(result).toHaveLength(1)
    })
  })

  describe('deleteWebhook', () => {
    it('deletes a webhook', async () => {
      prisma.webhook.findUnique.mockResolvedValue({ id: 'wh-1', channelId, name: 'Bot' })
      prisma.channel.findUnique.mockResolvedValue(textChannel)
      prisma.webhook.delete.mockResolvedValue({})

      await service.deleteWebhook('wh-1', userId)
      expect(prisma.webhook.delete).toHaveBeenCalledWith({ where: { id: 'wh-1' } })
      expect(auditLog.log).toHaveBeenCalled()
    })

    it('throws when webhook not found', async () => {
      prisma.webhook.findUnique.mockResolvedValue(null)
      await expect(service.deleteWebhook('bad', userId)).rejects.toThrow(NotFoundException)
    })
  })

  describe('executeWebhook', () => {
    const webhook = {
      id: 'wh-1',
      channelId,
      name: 'Bot',
      avatarUrl: 'https://bot.png',
      createdById: userId,
      token: 'tok-1',
    }

    const createdMessage = {
      id: 'msg-1',
      channelId,
      authorId: userId,
      content: 'Hello from webhook',
      webhookId: 'wh-1',
      webhookName: 'Bot',
      webhookAvatarUrl: 'https://bot.png',
      reactions: [],
      author: { id: userId },
      attachments: [],
      replyTo: null,
      linkPreviews: [],
      webhook: null,
      poll: null,
      _count: { threadMessages: 0 },
      threadMessages: [],
    }

    beforeEach(() => {
      prisma.webhook.findUnique.mockResolvedValue(webhook)
      prisma.channel.findUnique.mockResolvedValue(textChannel)
      prisma.message.create.mockResolvedValue(createdMessage)
    })

    it('creates a message and emits event', async () => {
      const result = await service.executeWebhook('tok-1', 'Hello from webhook')

      expect(prisma.message.create).toHaveBeenCalled()
      expect(events.emit).toHaveBeenCalledWith('webhook:message', expect.objectContaining({
        channelId,
        serverId,
      }))
      expect(result.webhook).toBeDefined()
    })

    it('uses override username and avatar when provided', async () => {
      await service.executeWebhook('tok-1', 'Hello', 'Custom Name', 'https://custom.png')

      const createCall = prisma.message.create.mock.calls[0][0]
      expect(createCall.data.webhookName).toBe('Custom Name')
      expect(createCall.data.webhookAvatarUrl).toBe('https://custom.png')
    })

    it('falls back to webhook defaults when overrides empty', async () => {
      await service.executeWebhook('tok-1', 'Hello', '', '')

      const createCall = prisma.message.create.mock.calls[0][0]
      expect(createCall.data.webhookName).toBe('Bot')
      expect(createCall.data.webhookAvatarUrl).toBe('https://bot.png')
    })

    it('throws when token not found', async () => {
      prisma.webhook.findUnique.mockResolvedValue(null)
      await expect(service.executeWebhook('bad-tok', 'Hello')).rejects.toThrow(NotFoundException)
    })

    it('throws when content is empty', async () => {
      await expect(service.executeWebhook('tok-1', '   ')).rejects.toThrow(BadRequestException)
    })

    it('fires link preview generation without blocking', async () => {
      linkPreviews.generatePreviews.mockResolvedValue([{ url: 'https://example.com', title: 'Ex' }])

      await service.executeWebhook('tok-1', 'Check https://example.com')
      expect(linkPreviews.generatePreviews).toHaveBeenCalled()
    })
  })
})
