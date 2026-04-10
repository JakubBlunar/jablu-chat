import { Test, TestingModule } from '@nestjs/testing'
import { ConflictException, NotFoundException } from '@nestjs/common'
import { BookmarksService } from './bookmarks.service'
import { PrismaService } from '../prisma/prisma.service'
import { RolesService } from '../roles/roles.service'
import { createMockPrismaService, MockPrismaService } from '../__mocks__/prisma.mock'

describe('BookmarksService', () => {
  let service: BookmarksService
  let prisma: MockPrismaService

  const userId = 'user-1'
  const messageId = 'msg-1'

  beforeEach(async () => {
    prisma = createMockPrismaService()

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookmarksService,
        { provide: PrismaService, useValue: prisma },
        { provide: RolesService, useValue: { requireMembership: jest.fn().mockResolvedValue({}), getChannelPermissions: jest.fn().mockResolvedValue(0n) } },
      ],
    }).compile()

    service = module.get(BookmarksService)
  })

  describe('toggle', () => {
    it('removes an existing bookmark', async () => {
      prisma.messageBookmark.findUnique.mockResolvedValue({ id: 'bk-1' })
      prisma.messageBookmark.delete.mockResolvedValue({})

      const result = await service.toggle(userId, messageId)
      expect(result).toEqual({ action: 'removed', messageId })
    })

    it('adds a new bookmark', async () => {
      prisma.messageBookmark.findUnique.mockResolvedValue(null)
      prisma.message.findUnique.mockResolvedValue({ id: messageId })
      prisma.messageBookmark.create.mockResolvedValue({ id: 'bk-new' })

      const result = await service.toggle(userId, messageId, 'my note')
      expect(result).toEqual({ action: 'added', messageId, bookmarkId: 'bk-new' })
      expect(prisma.messageBookmark.create).toHaveBeenCalledWith({
        data: { userId, messageId, note: 'my note' },
      })
    })

    it('throws NotFoundException when message does not exist', async () => {
      prisma.messageBookmark.findUnique.mockResolvedValue(null)
      prisma.message.findUnique.mockResolvedValue(null)

      await expect(service.toggle(userId, messageId)).rejects.toThrow(NotFoundException)
    })

    it('throws ConflictException on race condition (P2002)', async () => {
      prisma.messageBookmark.findUnique.mockResolvedValue(null)
      prisma.message.findUnique.mockResolvedValue({ id: messageId })

      const { PrismaClientKnownRequestError } = jest.requireActual('@prisma/client-runtime-utils') as any
      prisma.messageBookmark.create.mockRejectedValue(
        new PrismaClientKnownRequestError('Unique', { code: 'P2002', clientVersion: '6.0.0' }),
      )

      await expect(service.toggle(userId, messageId)).rejects.toThrow(ConflictException)
    })
  })

  describe('list', () => {
    it('returns bookmarks with pagination', async () => {
      const bookmarks = Array.from({ length: 3 }, (_, i) => ({
        id: `bk-${i}`,
        message: { id: `msg-${i}` },
      }))
      prisma.messageBookmark.findMany.mockResolvedValue(bookmarks)

      const result = await service.list(userId)
      expect(result.bookmarks).toHaveLength(3)
      expect(result.hasMore).toBe(false)
    })

    it('sets hasMore when more results available', async () => {
      const bookmarks = Array.from({ length: 51 }, (_, i) => ({
        id: `bk-${i}`,
        message: { id: `msg-${i}` },
      }))
      prisma.messageBookmark.findMany.mockResolvedValue(bookmarks)

      const result = await service.list(userId)
      expect(result.bookmarks).toHaveLength(50)
      expect(result.hasMore).toBe(true)
    })
  })

  describe('listIds', () => {
    it('returns array of message IDs', async () => {
      prisma.messageBookmark.findMany.mockResolvedValue([
        { messageId: 'msg-1' },
        { messageId: 'msg-2' },
      ])

      const ids = await service.listIds(userId)
      expect(ids).toEqual(['msg-1', 'msg-2'])
    })
  })

  describe('remove', () => {
    it('deletes a bookmark', async () => {
      prisma.messageBookmark.findUnique.mockResolvedValue({ id: 'bk-1' })
      prisma.messageBookmark.delete.mockResolvedValue({})

      await service.remove(userId, messageId)
      expect(prisma.messageBookmark.delete).toHaveBeenCalledWith({ where: { id: 'bk-1' } })
    })

    it('throws NotFoundException when not found', async () => {
      prisma.messageBookmark.findUnique.mockResolvedValue(null)
      await expect(service.remove(userId, messageId)).rejects.toThrow(NotFoundException)
    })
  })

  describe('check', () => {
    it('returns bookmarked true when exists', async () => {
      prisma.messageBookmark.findUnique.mockResolvedValue({ id: 'bk-1' })
      const result = await service.check(userId, messageId)
      expect(result).toEqual({ bookmarked: true })
    })

    it('returns bookmarked false when not exists', async () => {
      prisma.messageBookmark.findUnique.mockResolvedValue(null)
      const result = await service.check(userId, messageId)
      expect(result).toEqual({ bookmarked: false })
    })
  })

  describe('removeForServer', () => {
    it('deletes all bookmarks for a server', async () => {
      prisma.messageBookmark.deleteMany.mockResolvedValue({ count: 5 })

      await service.removeForServer(userId, 'server-1')
      expect(prisma.messageBookmark.deleteMany).toHaveBeenCalledWith({
        where: { userId, message: { channel: { serverId: 'server-1' } } },
      })
    })
  })
})
