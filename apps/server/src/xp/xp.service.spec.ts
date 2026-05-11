import { Test, TestingModule } from '@nestjs/testing'
import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { XpService, xpForLevel, levelFromXp, totalXpForLevel } from './xp.service'
import { PrismaService } from '../prisma/prisma.service'
import { RedisService } from '../redis/redis.service'
import { EventBusService } from '../events/event-bus.service'
import { createMockPrismaService, MockPrismaService } from '../__mocks__/prisma.mock'
import { createMockRedisService, MockRedisService } from '../__mocks__/redis.mock'

describe('XpService', () => {
  let service: XpService
  let prisma: MockPrismaService
  let redis: MockRedisService
  let events: { emit: jest.Mock }

  const serverId = 'server-1'
  const userId = 'user-1'

  beforeEach(async () => {
    prisma = createMockPrismaService()
    redis = createMockRedisService()
    events = { emit: jest.fn() }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        XpService,
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: redis },
        { provide: EventBusService, useValue: events }
      ]
    }).compile()

    service = module.get(XpService)
  })

  describe('level math', () => {
    it('xpForLevel matches formula', () => {
      expect(xpForLevel(0)).toBe(100)
      expect(xpForLevel(1)).toBe(5 + 50 + 100)
      expect(xpForLevel(10)).toBe(5 * 100 + 500 + 100)
    })

    it('levelFromXp is the inverse of totalXpForLevel', () => {
      for (const level of [0, 1, 5, 10, 20]) {
        const total = totalXpForLevel(level)
        expect(levelFromXp(total)).toBe(level)
        expect(levelFromXp(total + 1)).toBe(level)
        if (level > 0) {
          expect(levelFromXp(total - 1)).toBe(level - 1)
        }
      }
    })
  })

  describe('tryAwardForMessage', () => {
    it('returns null when xp is disabled', async () => {
      prisma.server.findUnique.mockResolvedValue({ xpEnabled: false })
      const result = await service.tryAwardForMessage(serverId, userId)
      expect(result).toBeNull()
      expect(redis.client.set).not.toHaveBeenCalled()
    })

    it('returns null when cooldown is active', async () => {
      prisma.server.findUnique.mockResolvedValue({ xpEnabled: true })
      redis.client.set.mockResolvedValue(null)
      const result = await service.tryAwardForMessage(serverId, userId)
      expect(result).toBeNull()
      expect(prisma.serverMember.update).not.toHaveBeenCalled()
    })

    it('awards XP and leaves the level unchanged below the threshold', async () => {
      prisma.server.findUnique.mockResolvedValue({ xpEnabled: true })
      redis.client.set.mockResolvedValue('OK')
      prisma.serverMember.findUnique.mockResolvedValue({ xp: 0, level: 0 })
      prisma.serverMember.update.mockResolvedValue({})

      const result = await service.tryAwardForMessage(serverId, userId)
      expect(result).not.toBeNull()
      expect(result!.awarded).toBeGreaterThanOrEqual(15)
      expect(result!.awarded).toBeLessThanOrEqual(25)
      expect(result!.level).toBe(0)
      expect(result!.leveledUp).toBe(false)
      expect(events.emit).not.toHaveBeenCalled()
    })

    it('emits xp:level-up when crossing a threshold', async () => {
      prisma.server.findUnique.mockResolvedValue({ xpEnabled: true })
      redis.client.set.mockResolvedValue('OK')
      prisma.serverMember.findUnique.mockResolvedValue({ xp: 95, level: 0 })
      prisma.serverMember.update.mockResolvedValue({})

      const result = await service.tryAwardForMessage(serverId, userId)
      expect(result!.leveledUp).toBe(true)
      expect(result!.level).toBe(1)
      expect(events.emit).toHaveBeenCalledWith('xp:level-up', expect.objectContaining({
        serverId,
        userId,
        level: 1
      }))
    })

    it('returns null and does not award when the member row is missing', async () => {
      prisma.server.findUnique.mockResolvedValue({ xpEnabled: true })
      redis.client.set.mockResolvedValue('OK')
      prisma.serverMember.findUnique.mockResolvedValue(null)

      const result = await service.tryAwardForMessage(serverId, userId)
      expect(result).toBeNull()
      expect(prisma.serverMember.update).not.toHaveBeenCalled()
    })

    it('returns null when redis throws', async () => {
      prisma.server.findUnique.mockResolvedValue({ xpEnabled: true })
      redis.client.set.mockRejectedValue(new Error('redis down'))
      const result = await service.tryAwardForMessage(serverId, userId)
      expect(result).toBeNull()
    })
  })

  describe('getMemberProgress', () => {
    it('throws when the server does not exist', async () => {
      prisma.server.findUnique.mockResolvedValue(null)
      await expect(service.getMemberProgress(serverId, userId)).rejects.toBeInstanceOf(NotFoundException)
    })

    it('throws when leveling is disabled', async () => {
      prisma.server.findUnique.mockResolvedValue({ xpEnabled: false })
      await expect(service.getMemberProgress(serverId, userId)).rejects.toBeInstanceOf(ForbiddenException)
    })

    it('returns progress for a member', async () => {
      prisma.server.findUnique.mockResolvedValue({ xpEnabled: true })
      prisma.serverMember.findUnique.mockResolvedValue({ xp: 250, level: 1 })
      const result = await service.getMemberProgress(serverId, userId)
      expect(result.xp).toBe(250)
      expect(result.level).toBe(1)
      expect(result.xpNeededForLevel).toBe(xpForLevel(1))
      expect(result.xpIntoLevel).toBe(250 - xpForLevel(0))
    })
  })

  describe('getLeaderboard', () => {
    it('rejects non-members', async () => {
      prisma.server.findUnique.mockResolvedValue({ xpEnabled: true })
      prisma.serverMember.findUnique.mockResolvedValue(null)
      await expect(service.getLeaderboard(serverId, userId)).rejects.toBeInstanceOf(ForbiddenException)
    })

    it('returns a ranked list', async () => {
      prisma.server.findUnique.mockResolvedValue({ xpEnabled: true })
      prisma.serverMember.findUnique.mockResolvedValue({ userId })
      prisma.serverMember.findMany.mockResolvedValue([
        { userId: 'a', xp: 500, level: 2, user: { id: 'a', username: 'a', displayName: 'A', avatarUrl: null, isBot: false } },
        { userId: 'b', xp: 200, level: 1, user: { id: 'b', username: 'b', displayName: 'B', avatarUrl: null, isBot: false } }
      ])

      const rows = await service.getLeaderboard(serverId, userId)
      expect(rows).toHaveLength(2)
      expect(rows[0].rank).toBe(1)
      expect(rows[1].rank).toBe(2)
    })
  })
})
