import { Test, TestingModule } from '@nestjs/testing'
import { AuditLogService } from './audit-log.service'
import { PrismaService } from '../prisma/prisma.service'
import { createMockPrismaService, MockPrismaService } from '../__mocks__/prisma.mock'

describe('AuditLogService', () => {
  let service: AuditLogService
  let prisma: MockPrismaService

  beforeEach(async () => {
    prisma = createMockPrismaService()
    const module: TestingModule = await Test.createTestingModule({
      providers: [AuditLogService, { provide: PrismaService, useValue: prisma }]
    }).compile()
    service = module.get(AuditLogService)
  })

  describe('log', () => {
    it('creates an audit log entry', async () => {
      prisma.auditLog.create.mockResolvedValue({ id: 'entry1' })

      await service.log('s1', 'u1', 'KICK_MEMBER', 'user', 'u2', 'Spamming')

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          serverId: 's1',
          actorId: 'u1',
          action: 'KICK_MEMBER',
          targetType: 'user',
          targetId: 'u2',
          details: 'Spamming'
        }
      })
    })

    it('creates entry with optional fields undefined', async () => {
      prisma.auditLog.create.mockResolvedValue({ id: 'entry2' })

      await service.log('s1', 'u1', 'UPDATE_SERVER')

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          serverId: 's1',
          actorId: 'u1',
          action: 'UPDATE_SERVER',
          targetType: undefined,
          targetId: undefined,
          details: undefined
        }
      })
    })
  })

  describe('getLog', () => {
    it('returns entries with hasMore=false when under limit', async () => {
      const entries = [{ id: 'e1' }, { id: 'e2' }]
      prisma.auditLog.findMany.mockResolvedValue(entries)

      const result = await service.getLog('s1', 10)

      expect(result.entries).toEqual(entries)
      expect(result.hasMore).toBe(false)
    })

    it('returns hasMore=true when more entries exist', async () => {
      const entries = Array.from({ length: 11 }, (_, i) => ({
        id: `e${i}`,
        createdAt: new Date('2024-01-15T00:00:00Z')
      }))
      prisma.auditLog.findMany.mockResolvedValue(entries)

      const result = await service.getLog('s1', 10)

      expect(result.entries).toHaveLength(10)
      expect(result.hasMore).toBe(true)
    })

    it('clamps limit to minimum of 1', async () => {
      prisma.auditLog.findMany.mockResolvedValue([])

      await service.getLog('s1', -5)

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 2 }) // 1 + 1
      )
    })

    it('clamps limit to maximum of 100', async () => {
      prisma.auditLog.findMany.mockResolvedValue([])

      await service.getLog('s1', 999)

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 101 }) // 100 + 1
      )
    })

    it('applies cursor filter when provided', async () => {
      prisma.auditLog.findMany.mockResolvedValue([])

      await service.getLog('s1', 50, '2024-01-15T00:00:00Z')

      const call = prisma.auditLog.findMany.mock.calls[0][0]
      expect(call.where.AND).toContainEqual({ createdAt: { lt: new Date('2024-01-15T00:00:00Z') } })
    })

    it('does not apply cursor filter when not provided', async () => {
      prisma.auditLog.findMany.mockResolvedValue([])

      await service.getLog('s1')

      const call = prisma.auditLog.findMany.mock.calls[0][0]
      expect(call.where.createdAt).toBeUndefined()
    })

    it('uses the ID to include remaining entries with the same timestamp', async () => {
      prisma.auditLog.findMany.mockResolvedValue([])
      const timestamp = '2024-01-15T00:00:00.000Z'
      await service.getLog('s1', 10, `${timestamp}|e2`)
      expect(prisma.auditLog.findMany.mock.calls[0][0].where.AND).toContainEqual({
        OR: [{ createdAt: { lt: new Date(timestamp) } }, { createdAt: new Date(timestamp), id: { lt: 'e2' } }]
      })
    })

    it('returns a stable next cursor for the last visible entry', async () => {
      const createdAt = new Date('2024-01-15T00:00:00Z')
      prisma.auditLog.findMany.mockResolvedValue([
        { id: 'e2', createdAt },
        { id: 'e1', createdAt }
      ])
      const result = await service.getLog('s1', 1)
      expect(result.nextCursor).toBe('2024-01-15T00:00:00.000Z|e2')
      expect(result.entries).toHaveLength(1)
    })

    it('searches across the full server history while preserving the action filter', async () => {
      prisma.auditLog.findMany.mockResolvedValue([])
      await service.getLog('s1', 25, undefined, { search: '  moderator  ', action: 'member.ban' })
      const { where } = prisma.auditLog.findMany.mock.calls[0][0]
      expect(where.serverId).toBe('s1')
      expect(where.action).toBe('member.ban')
      expect(where.AND[0].OR).toContainEqual({ actor: { username: { contains: 'moderator', mode: 'insensitive' } } })
    })

    it('includes actor in query', async () => {
      prisma.auditLog.findMany.mockResolvedValue([])

      await service.getLog('s1')

      const call = prisma.auditLog.findMany.mock.calls[0][0]
      expect(call.include.actor).toBeDefined()
    })

    it('orders by createdAt descending', async () => {
      prisma.auditLog.findMany.mockResolvedValue([])

      await service.getLog('s1')

      const call = prisma.auditLog.findMany.mock.calls[0][0]
      expect(call.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }])
    })
  })
})
