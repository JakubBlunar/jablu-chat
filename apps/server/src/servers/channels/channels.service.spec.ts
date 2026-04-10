import { Test, TestingModule } from '@nestjs/testing'
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import { ChannelsService } from './channels.service'
import { PrismaService } from '../../prisma/prisma.service'
import { EventBusService } from '../../events/event-bus.service'
import { UploadsService } from '../../uploads/uploads.service'
import { AuditLogService } from '../audit-log.service'
import { RolesService } from '../../roles/roles.service'
import { createMockPrismaService, MockPrismaService } from '../../__mocks__/prisma.mock'

describe('ChannelsService', () => {
  let service: ChannelsService
  let prisma: MockPrismaService
  let events: { emit: jest.Mock }
  let uploads: { deleteFile: jest.Mock }
  let auditLog: { log: jest.Mock }
  let roles: { requirePermission: jest.Mock; requireMembership: jest.Mock; getAllChannelPermissions: jest.Mock }

  const serverId = 'server-1'
  const userId = 'user-1'
  const channelId = 'ch-1'

  beforeEach(async () => {
    prisma = createMockPrismaService()
    events = { emit: jest.fn() }
    uploads = { deleteFile: jest.fn() }
    auditLog = { log: jest.fn().mockResolvedValue(undefined) }
    roles = {
      requirePermission: jest.fn().mockResolvedValue(0n),
      requireMembership: jest.fn().mockResolvedValue({ server: {}, membership: {} }),
      getAllChannelPermissions: jest.fn().mockResolvedValue({}),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChannelsService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventBusService, useValue: events },
        { provide: UploadsService, useValue: uploads },
        { provide: AuditLogService, useValue: auditLog },
        { provide: RolesService, useValue: roles },
      ],
    }).compile()

    service = module.get(ChannelsService)
  })

  describe('createChannel', () => {
    it('creates a channel with next position', async () => {
      prisma.channel.aggregate.mockResolvedValue({ _max: { position: 3 } })
      prisma.channel.create.mockResolvedValue({
        id: 'ch-new',
        serverId,
        name: 'general',
        type: 'text',
        position: 4,
      })

      const result = await service.createChannel(serverId, userId, 'general', 'text' as any)
      expect(result.position).toBe(4)
      expect(events.emit).toHaveBeenCalledWith('channel:created', expect.any(Object))
      expect(auditLog.log).toHaveBeenCalled()
    })

    it('starts at position 0 when no channels exist', async () => {
      prisma.channel.aggregate.mockResolvedValue({ _max: { position: null } })
      prisma.channel.create.mockResolvedValue({ id: 'ch-new', position: 0 })

      const result = await service.createChannel(serverId, userId, 'first', 'text' as any)
      expect(prisma.channel.create.mock.calls[0][0].data.position).toBe(0)
    })

    it('throws ConflictException on duplicate name', async () => {
      prisma.channel.aggregate.mockResolvedValue({ _max: { position: 0 } })
      const { PrismaClientKnownRequestError } = jest.requireActual('@prisma/client-runtime-utils') as any
      prisma.channel.create.mockRejectedValue(
        new PrismaClientKnownRequestError('Unique', { code: 'P2002', clientVersion: '6.0.0' }),
      )

      await expect(
        service.createChannel(serverId, userId, 'dup', 'text' as any),
      ).rejects.toThrow(ConflictException)
    })

    it('passes categoryId when provided', async () => {
      prisma.channel.aggregate.mockResolvedValue({ _max: { position: 0 } })
      prisma.channel.create.mockResolvedValue({ id: 'ch-new' })

      await service.createChannel(serverId, userId, 'test', 'text' as any, 'cat-1')
      expect(prisma.channel.create.mock.calls[0][0].data.categoryId).toBe('cat-1')
    })

    it('creates a forum channel with forum-specific options', async () => {
      prisma.channel.aggregate.mockResolvedValue({ _max: { position: 0 } })
      prisma.channel.create.mockResolvedValue({
        id: 'ch-forum',
        serverId,
        name: 'help',
        type: 'forum',
        position: 1,
        defaultLayout: 'grid',
        requireTags: true,
      })

      const result = await service.createChannel(serverId, userId, 'help', 'forum' as any, null, {
        defaultLayout: 'grid',
        requireTags: true,
        postGuidelines: 'Be kind'
      })
      expect(result.type).toBe('forum')
      const createData = prisma.channel.create.mock.calls[0][0].data
      expect(createData.defaultLayout).toBe('grid')
      expect(createData.requireTags).toBe(true)
      expect(createData.postGuidelines).toBe('Be kind')
    })

    it('ignores forum options for non-forum channels', async () => {
      prisma.channel.aggregate.mockResolvedValue({ _max: { position: 0 } })
      prisma.channel.create.mockResolvedValue({ id: 'ch-text', type: 'text' })

      await service.createChannel(serverId, userId, 'general', 'text' as any, null, {
        defaultLayout: 'grid',
      })
      const createData = prisma.channel.create.mock.calls[0][0].data
      expect(createData.defaultLayout).toBeUndefined()
    })
  })

  describe('getChannels', () => {
    it('returns channels with pinnedCount', async () => {
      prisma.channel.findMany.mockResolvedValue([
        { id: 'ch-1', name: 'general', _count: { messages: 3 } },
        { id: 'ch-2', name: 'random', _count: { messages: 0 } },
      ])

      const result = await service.getChannels(serverId, userId)
      expect(result[0].pinnedCount).toBe(3)
      expect(result[1].pinnedCount).toBe(0)
      expect(roles.requireMembership).toHaveBeenCalled()
    })
  })

  describe('updateChannel', () => {
    beforeEach(() => {
      prisma.channel.findFirst.mockResolvedValue({ id: channelId, serverId, type: 'text', name: 'old' })
    })

    it('updates channel fields', async () => {
      prisma.channel.update.mockResolvedValue({ id: channelId, name: 'new-name' })

      const result = await service.updateChannel(serverId, channelId, userId, { name: 'new-name' })
      expect(result.name).toBe('new-name')
      expect(events.emit).toHaveBeenCalledWith('channel:updated', expect.any(Object))
    })

    it('returns early when no fields to update', async () => {
      const result = await service.updateChannel(serverId, channelId, userId, {})
      expect(prisma.channel.update).not.toHaveBeenCalled()
    })

    it('throws when channel not found', async () => {
      prisma.channel.findFirst.mockResolvedValue(null)
      await expect(
        service.updateChannel(serverId, channelId, userId, { name: 'test' }),
      ).rejects.toThrow(NotFoundException)
    })

    it('throws when archiving a voice channel', async () => {
      prisma.channel.findFirst.mockResolvedValue({ id: channelId, serverId, type: 'voice' })
      await expect(
        service.updateChannel(serverId, channelId, userId, { isArchived: true }),
      ).rejects.toThrow(BadRequestException)
    })

    it('allows archiving a forum channel', async () => {
      prisma.channel.findFirst.mockResolvedValue({ id: channelId, serverId, type: 'forum', name: 'help' })
      prisma.channel.update.mockResolvedValue({ id: channelId, isArchived: true })

      const result = await service.updateChannel(serverId, channelId, userId, { isArchived: true })
      expect(result.isArchived).toBe(true)
    })

    it('throws ConflictException on duplicate name', async () => {
      const { PrismaClientKnownRequestError } = jest.requireActual('@prisma/client-runtime-utils') as any
      prisma.channel.update.mockRejectedValue(
        new PrismaClientKnownRequestError('Unique', { code: 'P2002', clientVersion: '6.0.0' }),
      )

      await expect(
        service.updateChannel(serverId, channelId, userId, { name: 'dup' }),
      ).rejects.toThrow(ConflictException)
    })
  })

  describe('deleteChannel', () => {
    it('deletes channel and cleans up attachments', async () => {
      prisma.channel.findFirst.mockResolvedValue({ id: channelId, serverId, name: 'general' })
      prisma.attachment.findMany.mockResolvedValue([
        { url: '/uploads/file.png', thumbnailUrl: '/uploads/thumb.png' },
        { url: '/uploads/file2.png', thumbnailUrl: null },
      ])
      prisma.channel.delete.mockResolvedValue({})

      await service.deleteChannel(serverId, channelId, userId)
      expect(uploads.deleteFile).toHaveBeenCalledTimes(3) // 2 urls + 1 thumbnail
      expect(prisma.channel.delete).toHaveBeenCalled()
      expect(events.emit).toHaveBeenCalledWith('channel:deleted', { serverId, channelId })
    })

    it('throws when channel not found', async () => {
      prisma.channel.findFirst.mockResolvedValue(null)
      await expect(
        service.deleteChannel(serverId, channelId, userId),
      ).rejects.toThrow(NotFoundException)
    })
  })

  describe('reorderChannels', () => {
    it('reorders channels with transactional position updates', async () => {
      prisma.channel.findMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }, { id: 'c' }])
      prisma.$transaction.mockResolvedValue(undefined)

      await service.reorderChannels(serverId, userId, ['a', 'b', 'c'])
      expect(prisma.$transaction).toHaveBeenCalled()
      expect(auditLog.log).toHaveBeenCalled()
      expect(events.emit).toHaveBeenCalledWith('channel:reorder', expect.any(Object))
    })

    it('throws when channel IDs do not match server', async () => {
      prisma.channel.findMany.mockResolvedValue([{ id: 'a' }])

      await expect(
        service.reorderChannels(serverId, userId, ['a', 'b']),
      ).rejects.toThrow(BadRequestException)
    })
  })
})
