import { Test, TestingModule } from '@nestjs/testing'
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { MessagesService } from './messages.service'
import { PrismaService } from '../prisma/prisma.service'
import { RolesService } from '../roles/roles.service'
import { createMockPrismaService, MockPrismaService } from '../__mocks__/prisma.mock'

describe('MessagesService', () => {
  let service: MessagesService
  let prisma: MockPrismaService
  let roles: { requirePermission: jest.Mock; requireChannelPermission: jest.Mock }

  const userId = 'user-1'
  const channelId = 'channel-1'
  const serverId = 'server-1'

  const textChannel = { id: channelId, serverId, type: 'text' }
  const membership = { userId, serverId }

  function makeMessage(overrides: Record<string, unknown> = {}) {
    return {
      id: 'msg-1',
      channelId,
      authorId: userId,
      content: 'Hello world',
      deleted: false,
      pinned: false,
      editedAt: null,
      createdAt: new Date('2024-06-01'),
      threadParentId: null,
      replyToId: null,
      directConversationId: null,
      webhookId: null,
      webhookName: null,
      webhookAvatarUrl: null,
      author: { id: userId, username: 'testuser', displayName: 'Test', avatarUrl: null },
      attachments: [],
      reactions: [],
      replyTo: null,
      linkPreviews: [],
      webhook: null,
      poll: null,
      _count: { threadMessages: 0 },
      threadMessages: [],
      channel: { serverId },
      ...overrides,
    }
  }

  beforeEach(async () => {
    prisma = createMockPrismaService()
    roles = {
      requirePermission: jest.fn().mockResolvedValue(0n),
      requireChannelPermission: jest.fn().mockResolvedValue(0n),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessagesService,
        { provide: PrismaService, useValue: prisma },
        { provide: RolesService, useValue: roles },
      ],
    }).compile()

    service = module.get(MessagesService)
  })

  function mockChannelAndMembership() {
    prisma.channel.findUnique.mockResolvedValue(textChannel)
    prisma.serverMember.findUnique.mockResolvedValue(membership)
  }

  describe('getMessages', () => {
    beforeEach(() => mockChannelAndMembership())

    it('returns messages with pagination info', async () => {
      const msgs = Array.from({ length: 3 }, (_, i) => makeMessage({ id: `msg-${i}` }))
      prisma.message.findMany.mockResolvedValue(msgs)

      const result = await service.getMessages(channelId, userId)
      expect(result.messages).toHaveLength(3)
      expect(result.hasMore).toBe(false)
    })

    it('sets hasMore when there are more messages', async () => {
      const msgs = Array.from({ length: 51 }, (_, i) => makeMessage({ id: `msg-${i}` }))
      prisma.message.findMany.mockResolvedValue(msgs)

      const result = await service.getMessages(channelId, userId, undefined, 50)
      expect(result.messages).toHaveLength(50)
      expect(result.hasMore).toBe(true)
    })

    it('uses cursor for pagination when provided', async () => {
      const cursorMsg = makeMessage({ id: 'cursor', createdAt: new Date('2024-06-01') })
      prisma.message.findFirst.mockResolvedValue(cursorMsg)
      prisma.message.findMany.mockResolvedValue([makeMessage({ id: 'older' })])

      const result = await service.getMessages(channelId, userId, 'cursor')
      expect(prisma.message.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ id: 'cursor' }) }),
      )
      expect(result.messages).toHaveLength(1)
    })

    it('throws BadRequestException for invalid cursor', async () => {
      prisma.message.findFirst.mockResolvedValue(null)

      await expect(
        service.getMessages(channelId, userId, 'invalid-cursor'),
      ).rejects.toThrow(BadRequestException)
    })

    it('clamps limit between 1 and 100', async () => {
      prisma.message.findMany.mockResolvedValue([])

      await service.getMessages(channelId, userId, undefined, 200)
      const call = prisma.message.findMany.mock.calls[0][0]
      expect(call.take).toBe(101) // 100 + 1 for hasMore check
    })

    it('throws NotFoundException when channel not found', async () => {
      prisma.channel.findUnique.mockResolvedValue(null)

      await expect(
        service.getMessages('bad-channel', userId),
      ).rejects.toThrow(NotFoundException)
    })

    it('throws ForbiddenException for voice channels', async () => {
      prisma.channel.findUnique.mockResolvedValue({ ...textChannel, type: 'voice' })

      await expect(
        service.getMessages(channelId, userId),
      ).rejects.toThrow(ForbiddenException)
    })

    it('throws ForbiddenException when not a member', async () => {
      prisma.channel.findUnique.mockResolvedValue(textChannel)
      prisma.serverMember.findUnique.mockResolvedValue(null)

      await expect(
        service.getMessages(channelId, userId),
      ).rejects.toThrow(ForbiddenException)
    })
  })

  describe('createMessage', () => {
    beforeEach(() => mockChannelAndMembership())

    it('creates a text message', async () => {
      const created = makeMessage()
      prisma.$transaction.mockImplementation(async (fn: any) => {
        return fn({
          attachment: { findMany: jest.fn() },
          message: { create: jest.fn().mockResolvedValue(created) },
        })
      })
      prisma.message.count.mockResolvedValue(0)

      const result = await service.createMessage(channelId, userId, 'Hello world')
      expect(result).toBeDefined()
      expect(result.content).toBe('Hello world')
    })

    it('throws BadRequestException for empty content with no attachments', async () => {
      await expect(
        service.createMessage(channelId, userId, '   '),
      ).rejects.toThrow(BadRequestException)
    })

    it('throws BadRequestException when content is undefined and no attachments', async () => {
      await expect(
        service.createMessage(channelId, userId, undefined, undefined, []),
      ).rejects.toThrow(BadRequestException)
    })

    it('validates replyToId exists', async () => {
      prisma.message.findFirst.mockResolvedValue(null) // replyTo not found

      await expect(
        service.createMessage(channelId, userId, 'reply', 'nonexistent'),
      ).rejects.toThrow(BadRequestException)
    })

    it('validates threadParentId exists', async () => {
      prisma.message.findFirst
        .mockResolvedValueOnce(null) // no replyTo check (replyToId is undefined)

      // threadParentId check
      prisma.message.findFirst.mockResolvedValue(null)

      await expect(
        service.createMessage(channelId, userId, 'thread reply', undefined, undefined, 'bad-parent'),
      ).rejects.toThrow(BadRequestException)
    })

    it('allows message with only attachments (no content)', async () => {
      const created = makeMessage({ content: null })
      prisma.$transaction.mockImplementation(async (fn: any) => {
        return fn({
          attachment: { findMany: jest.fn().mockResolvedValue([{ id: 'att-1' }]) },
          message: { create: jest.fn().mockResolvedValue(created) },
        })
      })
      prisma.message.count.mockResolvedValue(0)

      const result = await service.createMessage(channelId, userId, undefined, undefined, ['att-1'])
      expect(result).toBeDefined()
    })

    it('throws when attachment IDs do not match', async () => {
      prisma.$transaction.mockImplementation(async (fn: any) => {
        return fn({
          attachment: { findMany: jest.fn().mockResolvedValue([]) },
          message: { create: jest.fn() },
        })
      })

      await expect(
        service.createMessage(channelId, userId, undefined, undefined, ['att-1']),
      ).rejects.toThrow(BadRequestException)
    })
  })

  describe('editMessage', () => {
    beforeEach(() => mockChannelAndMembership())

    it('edits own message', async () => {
      const msg = makeMessage()
      prisma.message.findFirst.mockResolvedValue(msg)
      const updated = makeMessage({ content: 'Updated', editedAt: new Date() })
      prisma.message.update.mockResolvedValue(updated)

      const result = await service.editMessage('msg-1', userId, 'Updated')
      expect(result.content).toBe('Updated')
    })

    it('throws ForbiddenException when editing someone else\'s message', async () => {
      const msg = makeMessage({ authorId: 'other-user' })
      prisma.message.findFirst.mockResolvedValue(msg)

      await expect(
        service.editMessage('msg-1', userId, 'hack'),
      ).rejects.toThrow(ForbiddenException)
    })

    it('throws ForbiddenException when editing a deleted message', async () => {
      const msg = makeMessage({ deleted: true })
      prisma.message.findFirst.mockResolvedValue(msg)

      await expect(
        service.editMessage('msg-1', userId, 'revive'),
      ).rejects.toThrow(ForbiddenException)
    })

    it('throws NotFoundException when message not found', async () => {
      prisma.message.findFirst.mockResolvedValue(null)

      await expect(
        service.editMessage('missing', userId, 'content'),
      ).rejects.toThrow(NotFoundException)
    })
  })

  describe('deleteMessage', () => {
    beforeEach(() => mockChannelAndMembership())

    it('allows author to delete own message', async () => {
      const msg = makeMessage({ channel: { serverId } })
      prisma.message.findFirst.mockResolvedValue(msg)
      prisma.message.update.mockResolvedValue({})

      const result = await service.deleteMessage('msg-1', userId)
      expect(result).toEqual({ id: 'msg-1', deleted: true })
    })

    it('allows moderator (MANAGE_MESSAGES) to delete others\' messages', async () => {
      const msg = makeMessage({ authorId: 'other-user', channel: { serverId } })
      prisma.message.findFirst.mockResolvedValue(msg)
      prisma.message.update.mockResolvedValue({})

      const result = await service.deleteMessage('msg-1', userId)
      expect(roles.requirePermission).toHaveBeenCalled()
      expect(result.deleted).toBe(true)
    })

    it('throws ForbiddenException for non-author without MANAGE_MESSAGES', async () => {
      const msg = makeMessage({ authorId: 'other-user', channel: { serverId } })
      prisma.message.findFirst.mockResolvedValue(msg)
      roles.requirePermission.mockRejectedValue(new ForbiddenException())

      await expect(
        service.deleteMessage('msg-1', userId),
      ).rejects.toThrow(ForbiddenException)
    })

    it('returns early for already-deleted messages', async () => {
      const msg = makeMessage({ deleted: true, channel: { serverId } })
      prisma.message.findFirst.mockResolvedValue(msg)

      const result = await service.deleteMessage('msg-1', userId)
      expect(result).toEqual({ id: 'msg-1', deleted: true })
      expect(prisma.message.update).not.toHaveBeenCalled()
    })

    it('throws NotFoundException when message not found', async () => {
      prisma.message.findFirst.mockResolvedValue(null)

      await expect(
        service.deleteMessage('missing', userId),
      ).rejects.toThrow(NotFoundException)
    })
  })

  describe('pinMessage / unpinMessage', () => {
    beforeEach(() => mockChannelAndMembership())

    it('pins a message', async () => {
      prisma.message.findFirst.mockResolvedValue(makeMessage())
      const pinned = makeMessage({ pinned: true })
      prisma.message.update.mockResolvedValue(pinned)

      const result = await service.pinMessage('msg-1', userId, channelId)
      expect(result.pinned).toBe(true)
      expect(roles.requirePermission).toHaveBeenCalled()
    })

    it('throws BadRequestException when pinning a deleted message', async () => {
      prisma.message.findFirst.mockResolvedValue(makeMessage({ deleted: true }))

      await expect(
        service.pinMessage('msg-1', userId, channelId),
      ).rejects.toThrow(BadRequestException)
    })

    it('unpins a message', async () => {
      prisma.message.findFirst.mockResolvedValue(makeMessage({ pinned: true }))
      const unpinned = makeMessage({ pinned: false })
      prisma.message.update.mockResolvedValue(unpinned)

      const result = await service.unpinMessage('msg-1', userId, channelId)
      expect(result.pinned).toBe(false)
    })

    it('throws NotFoundException when message not found', async () => {
      prisma.message.findFirst.mockResolvedValue(null)

      await expect(
        service.pinMessage('missing', userId, channelId),
      ).rejects.toThrow(NotFoundException)
    })
  })

  describe('toggleReaction', () => {
    beforeEach(() => mockChannelAndMembership())

    it('adds a reaction when none exists', async () => {
      prisma.message.findFirst.mockResolvedValue(makeMessage())
      prisma.reaction.findUnique.mockResolvedValue(null)
      prisma.reaction.create.mockResolvedValue({})

      const result = await service.toggleReaction('msg-1', userId, '👍')
      expect(result.action).toBe('added')
      expect(result.emoji).toBe('👍')
    })

    it('removes a reaction when it already exists', async () => {
      prisma.message.findFirst.mockResolvedValue(makeMessage())
      prisma.reaction.findUnique.mockResolvedValue({ id: 'react-1' })
      prisma.reaction.delete.mockResolvedValue({})

      const result = await service.toggleReaction('msg-1', userId, '👍')
      expect(result.action).toBe('removed')
    })

    it('throws NotFoundException on deleted message', async () => {
      prisma.message.findFirst.mockResolvedValue(null)

      await expect(
        service.toggleReaction('missing', userId, '👍'),
      ).rejects.toThrow(NotFoundException)
    })
  })

  describe('getPinnedMessages', () => {
    beforeEach(() => mockChannelAndMembership())

    it('returns pinned messages', async () => {
      prisma.message.findMany.mockResolvedValue([
        makeMessage({ id: 'pinned-1', pinned: true }),
      ])

      const result = await service.getPinnedMessages(channelId, userId)
      expect(result).toHaveLength(1)
    })
  })

  describe('assertUserCanAccessChannel', () => {
    it('returns channel when member', async () => {
      prisma.channel.findUnique.mockResolvedValue(textChannel)
      prisma.serverMember.findUnique.mockResolvedValue(membership)

      const ch = await service.assertUserCanAccessChannel(channelId, userId)
      expect(ch.id).toBe(channelId)
    })

    it('throws NotFoundException when channel not found', async () => {
      prisma.channel.findUnique.mockResolvedValue(null)

      await expect(
        service.assertUserCanAccessChannel('missing', userId),
      ).rejects.toThrow(NotFoundException)
    })

    it('throws ForbiddenException when not a member', async () => {
      prisma.channel.findUnique.mockResolvedValue(textChannel)
      prisma.serverMember.findUnique.mockResolvedValue(null)

      await expect(
        service.assertUserCanAccessChannel(channelId, userId),
      ).rejects.toThrow(ForbiddenException)
    })
  })
})
