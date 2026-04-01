import { Test, TestingModule } from '@nestjs/testing'
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { ForumTagsService } from './forum-tags.service'
import { PrismaService } from '../prisma/prisma.service'
import { RolesService } from '../roles/roles.service'
import { createMockPrismaService, MockPrismaService } from '../__mocks__/prisma.mock'

describe('ForumTagsService', () => {
  let service: ForumTagsService
  let prisma: MockPrismaService
  let roles: { requirePermission: jest.Mock }

  const userId = 'user-1'
  const channelId = 'channel-1'
  const serverId = 'server-1'

  const forumChannel = { id: channelId, serverId, type: 'forum' }
  const textChannel = { id: channelId, serverId, type: 'text' }

  function makeTag(overrides: Record<string, unknown> = {}) {
    return { id: 'tag-1', channelId, name: 'Bug', color: '#ff0000', position: 0, createdAt: new Date(), ...overrides }
  }

  beforeEach(async () => {
    prisma = createMockPrismaService()
    roles = { requirePermission: jest.fn().mockResolvedValue(0n) }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ForumTagsService,
        { provide: PrismaService, useValue: prisma },
        { provide: RolesService, useValue: roles }
      ]
    }).compile()

    service = module.get(ForumTagsService)
  })

  describe('listTags', () => {
    it('returns tags for a forum channel', async () => {
      prisma.channel.findUnique.mockResolvedValue(forumChannel)
      const tags = [makeTag(), makeTag({ id: 'tag-2', name: 'Feature', position: 1 })]
      prisma.forumTag.findMany.mockResolvedValue(tags)

      const result = await service.listTags(channelId)
      expect(result).toHaveLength(2)
    })

    it('returns empty array for non-forum channel', async () => {
      prisma.channel.findUnique.mockResolvedValue(textChannel)
      const result = await service.listTags(channelId)
      expect(result).toEqual([])
    })

    it('throws if channel not found', async () => {
      prisma.channel.findUnique.mockResolvedValue(null)
      await expect(service.listTags(channelId)).rejects.toThrow(NotFoundException)
    })
  })

  describe('createTag', () => {
    beforeEach(() => {
      prisma.channel.findUnique.mockResolvedValue(forumChannel)
    })

    it('creates a tag', async () => {
      prisma.forumTag.aggregate.mockResolvedValue({ _max: { position: 1 } })
      prisma.forumTag.create.mockResolvedValue(makeTag({ position: 2 }))

      const result = await service.createTag(channelId, userId, 'Bug', '#ff0000')
      expect(result.name).toBe('Bug')
      expect(prisma.forumTag.create).toHaveBeenCalled()
    })

    it('sets position to 0 when no tags exist', async () => {
      prisma.forumTag.aggregate.mockResolvedValue({ _max: { position: null } })
      prisma.forumTag.create.mockResolvedValue(makeTag({ position: 0 }))

      await service.createTag(channelId, userId, 'Bug')
      expect(prisma.forumTag.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ position: 0 }) })
      )
    })

    it('throws on duplicate tag name', async () => {
      prisma.forumTag.aggregate.mockResolvedValue({ _max: { position: 0 } })
      const err = new Prisma.PrismaClientKnownRequestError('Unique constraint', { code: 'P2002', clientVersion: '5' })
      prisma.forumTag.create.mockRejectedValue(err)

      await expect(service.createTag(channelId, userId, 'Bug')).rejects.toThrow(ConflictException)
    })

    it('throws if channel is not a forum', async () => {
      prisma.channel.findUnique.mockResolvedValue(textChannel)
      await expect(service.createTag(channelId, userId, 'Bug')).rejects.toThrow(BadRequestException)
    })
  })

  describe('updateTag', () => {
    beforeEach(() => {
      prisma.channel.findUnique.mockResolvedValue(forumChannel)
    })

    it('updates a tag', async () => {
      prisma.forumTag.findFirst.mockResolvedValue(makeTag())
      prisma.forumTag.update.mockResolvedValue(makeTag({ name: 'Updated' }))

      const result = await service.updateTag(channelId, 'tag-1', userId, 'Updated')
      expect(result.name).toBe('Updated')
    })

    it('throws if tag not found', async () => {
      prisma.forumTag.findFirst.mockResolvedValue(null)
      await expect(service.updateTag(channelId, 'nonexistent', userId, 'X')).rejects.toThrow(NotFoundException)
    })

    it('throws on duplicate name after update', async () => {
      prisma.forumTag.findFirst.mockResolvedValue(makeTag())
      const err = new Prisma.PrismaClientKnownRequestError('Unique constraint', { code: 'P2002', clientVersion: '5' })
      prisma.forumTag.update.mockRejectedValue(err)

      await expect(service.updateTag(channelId, 'tag-1', userId, 'Existing')).rejects.toThrow(ConflictException)
    })
  })

  describe('deleteTag', () => {
    beforeEach(() => {
      prisma.channel.findUnique.mockResolvedValue(forumChannel)
    })

    it('deletes a tag', async () => {
      prisma.forumTag.findFirst.mockResolvedValue(makeTag())
      prisma.forumTag.delete.mockResolvedValue(makeTag())

      const result = await service.deleteTag(channelId, 'tag-1', userId)
      expect(result).toEqual({ id: 'tag-1', deleted: true })
    })

    it('throws if tag not found', async () => {
      prisma.forumTag.findFirst.mockResolvedValue(null)
      await expect(service.deleteTag(channelId, 'nonexistent', userId)).rejects.toThrow(NotFoundException)
    })
  })
})
