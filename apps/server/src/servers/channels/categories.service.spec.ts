import { Test, TestingModule } from '@nestjs/testing'
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { CategoriesService } from './categories.service'
import { PrismaService } from '../../prisma/prisma.service'
import { EventBusService } from '../../events/event-bus.service'
import { AuditLogService } from '../audit-log.service'
import { RolesService } from '../../roles/roles.service'
import { createMockPrismaService, MockPrismaService } from '../../__mocks__/prisma.mock'

describe('CategoriesService', () => {
  let service: CategoriesService
  let prisma: MockPrismaService
  let events: { emit: jest.Mock }
  let auditLog: { log: jest.Mock }
  let roles: { requirePermission: jest.Mock; requireMembership: jest.Mock }

  const serverId = 'server-1'
  const userId = 'user-1'

  beforeEach(async () => {
    prisma = createMockPrismaService()
    events = { emit: jest.fn() }
    auditLog = { log: jest.fn().mockResolvedValue(undefined) }
    roles = {
      requirePermission: jest.fn().mockResolvedValue(0n),
      requireMembership: jest.fn().mockResolvedValue({ server: {}, membership: {} }),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoriesService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventBusService, useValue: events },
        { provide: AuditLogService, useValue: auditLog },
        { provide: RolesService, useValue: roles },
      ],
    }).compile()

    service = module.get(CategoriesService)
  })

  describe('createCategory', () => {
    it('creates at next position', async () => {
      prisma.channelCategory.aggregate.mockResolvedValue({ _max: { position: 2 } })
      prisma.channelCategory.create.mockResolvedValue({ id: 'cat-1', name: 'Info', position: 3 })

      const result = await service.createCategory(serverId, userId, 'Info')
      expect(result.position).toBe(3)
      expect(events.emit).toHaveBeenCalledWith('category:created', expect.objectContaining({ serverId }))
    })

    it('starts at position 0 when no categories exist', async () => {
      prisma.channelCategory.aggregate.mockResolvedValue({ _max: { position: null } })
      prisma.channelCategory.create.mockResolvedValue({ id: 'cat-1', name: 'Info', position: 0 })

      const result = await service.createCategory(serverId, userId, 'Info')
      expect(result.position).toBe(0)
    })
  })

  describe('updateCategory', () => {
    it('updates a category', async () => {
      prisma.channelCategory.findFirst.mockResolvedValue({ id: 'cat-1', name: 'Old', position: 0 })
      prisma.channelCategory.update.mockResolvedValue({ id: 'cat-1', name: 'New', position: 0 })

      const result = await service.updateCategory(serverId, 'cat-1', userId, { name: 'New' })
      expect(result.name).toBe('New')
    })

    it('throws NotFoundException for missing category', async () => {
      prisma.channelCategory.findFirst.mockResolvedValue(null)

      await expect(service.updateCategory(serverId, 'cat-missing', userId, { name: 'X' }))
        .rejects.toThrow(NotFoundException)
    })

    it('returns existing category when no fields provided', async () => {
      const cat = { id: 'cat-1', name: 'Same', position: 0 }
      prisma.channelCategory.findFirst.mockResolvedValue(cat)

      const result = await service.updateCategory(serverId, 'cat-1', userId, {})
      expect(result).toBe(cat)
      expect(prisma.channelCategory.update).not.toHaveBeenCalled()
    })
  })

  describe('deleteCategory', () => {
    it('detaches channels and deletes the category', async () => {
      prisma.channelCategory.findFirst.mockResolvedValue({ id: 'cat-1', name: 'Info' })

      await service.deleteCategory(serverId, 'cat-1', userId)

      expect(prisma.channel.updateMany).toHaveBeenCalledWith({
        where: { categoryId: 'cat-1' },
        data: { categoryId: null },
      })
      expect(prisma.channelCategory.delete).toHaveBeenCalledWith({ where: { id: 'cat-1' } })
      expect(events.emit).toHaveBeenCalledWith('category:deleted', { serverId, categoryId: 'cat-1' })
    })

    it('throws NotFoundException for missing category', async () => {
      prisma.channelCategory.findFirst.mockResolvedValue(null)

      await expect(service.deleteCategory(serverId, 'cat-missing', userId))
        .rejects.toThrow(NotFoundException)
    })
  })

  describe('reorderCategories', () => {
    it('reorders categories by position', async () => {
      prisma.channelCategory.findMany.mockResolvedValue([{ id: 'cat-a' }, { id: 'cat-b' }])
      prisma.$transaction.mockResolvedValue(undefined)

      await service.reorderCategories(serverId, userId, ['cat-a', 'cat-b'])

      expect(prisma.$transaction).toHaveBeenCalled()
      expect(events.emit).toHaveBeenCalledWith('category:reorder', { serverId, categoryIds: ['cat-a', 'cat-b'] })
    })

    it('throws BadRequestException when IDs do not match', async () => {
      prisma.channelCategory.findMany.mockResolvedValue([{ id: 'cat-a' }])

      await expect(service.reorderCategories(serverId, userId, ['cat-a', 'cat-invalid']))
        .rejects.toThrow(BadRequestException)
    })
  })
})
