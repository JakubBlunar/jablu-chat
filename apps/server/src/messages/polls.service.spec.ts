import { Test, TestingModule } from '@nestjs/testing'
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { PollsService } from './polls.service'
import { PrismaService } from '../prisma/prisma.service'
import { RolesService } from '../roles/roles.service'
import { createMockPrismaService, MockPrismaService } from '../__mocks__/prisma.mock'

describe('PollsService', () => {
  let service: PollsService
  let prisma: MockPrismaService
  let roles: { requireChannelPermission: jest.Mock }

  const userId = 'user-1'
  const channelId = 'ch-1'
  const serverId = 'server-1'

  beforeEach(async () => {
    prisma = createMockPrismaService()
    roles = { requireChannelPermission: jest.fn().mockResolvedValue(0n) }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PollsService,
        { provide: PrismaService, useValue: prisma },
        { provide: RolesService, useValue: roles },
      ],
    }).compile()

    service = module.get(PollsService)
  })

  describe('createPoll', () => {
    beforeEach(() => {
      prisma.channel.findUnique.mockResolvedValue({ id: channelId, serverId, type: 'text' })
      prisma.serverMember.findUnique.mockResolvedValue({ userId, serverId })
    })

    it('throws when fewer than 2 options', async () => {
      await expect(
        service.createPoll(channelId, userId, 'Q?', ['Only one'], false),
      ).rejects.toThrow('Polls must have 2-10 options')
    })

    it('throws when more than 10 options', async () => {
      const opts = Array.from({ length: 11 }, (_, i) => `Opt ${i}`)
      await expect(
        service.createPoll(channelId, userId, 'Q?', opts, false),
      ).rejects.toThrow('Polls must have 2-10 options')
    })

    it('throws when question is empty', async () => {
      await expect(
        service.createPoll(channelId, userId, '   ', ['A', 'B'], false),
      ).rejects.toThrow('Question is required')
    })

    it('throws when channel is not a text channel', async () => {
      prisma.channel.findUnique.mockResolvedValue({ id: channelId, serverId, type: 'voice' })
      await expect(
        service.createPoll(channelId, userId, 'Q?', ['A', 'B'], false),
      ).rejects.toThrow(NotFoundException)
    })

    it('throws when channel not found', async () => {
      prisma.channel.findUnique.mockResolvedValue(null)
      await expect(
        service.createPoll(channelId, userId, 'Q?', ['A', 'B'], false),
      ).rejects.toThrow(NotFoundException)
    })

    it('throws when user does not have permission', async () => {
      roles.requireChannelPermission.mockRejectedValue(new ForbiddenException('Missing permission'))
      await expect(
        service.createPoll(channelId, userId, 'Q?', ['A', 'B'], false),
      ).rejects.toThrow(ForbiddenException)
    })

    it('creates a poll with message in a transaction', async () => {
      const mockMessage = {
        id: 'msg-1',
        channelId,
        authorId: userId,
        content: null,
        deleted: false,
        pinned: false,
        editedAt: null,
        createdAt: new Date(),
        threadParentId: null,
        replyToId: null,
        webhookId: null,
        webhookName: null,
        webhookAvatarUrl: null,
        directConversationId: null,
        author: { id: userId, username: 'alice', displayName: 'Alice', avatarUrl: null },
        attachments: [],
        reactions: [],
        replyTo: null,
        linkPreviews: [],
        webhook: null,
        poll: null,
        _count: { threadMessages: 0 },
        threadMessages: [],
      }
      const mockPoll = {
        id: 'poll-1',
        messageId: 'msg-1',
        question: 'Favorite?',
        multiSelect: true,
        expiresAt: null,
        createdAt: new Date(),
        options: [
          { id: 'opt-1', label: 'Red', position: 0, votes: [] },
          { id: 'opt-2', label: 'Blue', position: 1, votes: [] },
        ],
      }

      prisma.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          message: { create: jest.fn().mockResolvedValue(mockMessage) },
          poll: { create: jest.fn().mockResolvedValue(mockPoll) },
        }
        return fn(tx)
      })

      const result = await service.createPoll(channelId, userId, 'Favorite?', ['Red', 'Blue'], true)
      expect(result.poll).toBeDefined()
      expect(result.poll!.question).toBe('Favorite?')
      expect(result.poll!.options).toHaveLength(2)
    })
  })

  describe('votePoll', () => {
    const basePoll = {
      id: 'poll-1',
      messageId: 'msg-1',
      question: 'Q?',
      multiSelect: false,
      expiresAt: null,
      createdAt: new Date(),
      message: { channelId, channel: { serverId } },
      options: [
        { id: 'opt-1', label: 'A', position: 0, votes: [] },
        { id: 'opt-2', label: 'B', position: 1, votes: [] },
      ],
    }

    it('throws when poll not found', async () => {
      prisma.poll.findUnique.mockResolvedValue(null)
      await expect(service.votePoll('bad', 'opt-1', userId)).rejects.toThrow(NotFoundException)
    })

    it('throws when poll is expired', async () => {
      prisma.poll.findUnique.mockResolvedValue({
        ...basePoll,
        expiresAt: new Date('2020-01-01'),
      })
      await expect(service.votePoll('poll-1', 'opt-1', userId)).rejects.toThrow('This poll has expired')
    })

    it('throws when user does not have permission', async () => {
      prisma.poll.findUnique.mockResolvedValue(basePoll)
      roles.requireChannelPermission.mockRejectedValue(new ForbiddenException('Missing permission'))

      await expect(service.votePoll('poll-1', 'opt-1', userId)).rejects.toThrow(ForbiddenException)
    })

    it('throws when option not in poll', async () => {
      prisma.poll.findUnique.mockResolvedValue(basePoll)
      await expect(service.votePoll('poll-1', 'bad-opt', userId)).rejects.toThrow(NotFoundException)
    })

    it('toggles off an existing vote', async () => {
      prisma.poll.findUnique.mockResolvedValueOnce(basePoll)
      prisma.pollVote.findUnique.mockResolvedValue({ optionId: 'opt-1', userId })
      prisma.pollVote.delete.mockResolvedValue({})
      prisma.poll.findUnique.mockResolvedValueOnce({
        ...basePoll,
        options: basePoll.options.map((o) => ({ ...o, votes: [] })),
      })

      const result = await service.votePoll('poll-1', 'opt-1', userId)
      expect(prisma.pollVote.delete).toHaveBeenCalled()
      expect(result.poll).toBeDefined()
    })

    it('clears other votes for single-select and adds new vote', async () => {
      prisma.poll.findUnique.mockResolvedValueOnce(basePoll)
      prisma.pollVote.findUnique.mockResolvedValue(null) // no existing vote on this option
      prisma.pollVote.deleteMany.mockResolvedValue({ count: 1 })
      prisma.pollVote.create.mockResolvedValue({})
      prisma.poll.findUnique.mockResolvedValueOnce({
        ...basePoll,
        options: [
          { id: 'opt-1', label: 'A', position: 0, votes: [{ userId }] },
          { id: 'opt-2', label: 'B', position: 1, votes: [] },
        ],
      })

      const result = await service.votePoll('poll-1', 'opt-1', userId)
      expect(prisma.pollVote.deleteMany).toHaveBeenCalled()
      expect(prisma.pollVote.create).toHaveBeenCalled()
      expect(result.poll.options[0].voted).toBe(true)
    })

    it('does not clear other votes for multi-select', async () => {
      const multiPoll = { ...basePoll, multiSelect: true }
      prisma.poll.findUnique.mockResolvedValueOnce(multiPoll)
      prisma.pollVote.findUnique.mockResolvedValue(null)
      prisma.pollVote.create.mockResolvedValue({})
      prisma.poll.findUnique.mockResolvedValueOnce({
        ...multiPoll,
        options: [
          { id: 'opt-1', label: 'A', position: 0, votes: [{ userId }] },
          { id: 'opt-2', label: 'B', position: 1, votes: [{ userId }] },
        ],
      })

      const result = await service.votePoll('poll-1', 'opt-1', userId)
      expect(prisma.pollVote.deleteMany).not.toHaveBeenCalled()
      expect(prisma.pollVote.create).toHaveBeenCalled()
    })
  })

  describe('getPoll', () => {
    it('returns mapped poll', async () => {
      prisma.poll.findUnique.mockResolvedValue({
        id: 'poll-1',
        messageId: 'msg-1',
        question: 'Q?',
        multiSelect: false,
        expiresAt: null,
        createdAt: new Date('2024-06-01'),
        message: { channelId, channel: { serverId } },
        options: [{ id: 'opt-1', label: 'A', position: 0, votes: [] }],
      })

      const result = await service.getPoll('poll-1', userId)
      expect(result.id).toBe('poll-1')
      expect(result.options[0].voted).toBe(false)
    })

    it('throws when not found', async () => {
      prisma.poll.findUnique.mockResolvedValue(null)
      await expect(service.getPoll('bad', userId)).rejects.toThrow(NotFoundException)
    })
  })
})
