import { Test, TestingModule } from '@nestjs/testing'
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { ActivityService } from './activity.service'
import { PrismaService } from '../prisma/prisma.service'
import { RedisService } from '../redis/redis.service'
import { UploadsService } from '../uploads/uploads.service'
import { EventBusService } from '../events/event-bus.service'
import { Prisma } from '../prisma-client'
import { createMockPrismaService, MockPrismaService } from '../__mocks__/prisma.mock'
import { createMockRedisService, MockRedisService } from '../__mocks__/redis.mock'

describe('ActivityService', () => {
  let service: ActivityService
  let prisma: MockPrismaService
  let redis: MockRedisService
  let uploads: { saveActivityIcon: jest.Mock }
  let events: { emit: jest.Mock }

  const userId = 'user-1'

  beforeEach(async () => {
    prisma = createMockPrismaService()
    redis = createMockRedisService()
    uploads = { saveActivityIcon: jest.fn() }
    events = { emit: jest.fn() }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActivityService,
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: redis },
        { provide: UploadsService, useValue: uploads },
        { provide: EventBusService, useValue: events }
      ]
    }).compile()

    service = module.get(ActivityService)
  })

  describe('getSettings', () => {
    it('maps user columns to the settings shape', async () => {
      prisma.user.findUnique.mockResolvedValue({
        activityShareEnabled: true,
        activityShareOnline: false,
        activityDefaultSharing: 'friends_small',
        activityShareGames: true,
        activityShareMusic: false
      })
      const settings = await service.getSettings(userId)
      expect(settings).toEqual({
        shareEnabled: true,
        shareOnline: false,
        defaultSharing: 'friends_small',
        shareGames: true,
        shareMusic: false
      })
    })
  })

  describe('updateSettings', () => {
    it('only writes provided fields', async () => {
      prisma.user.update.mockResolvedValue({})
      prisma.user.findUnique.mockResolvedValue({
        activityShareEnabled: true,
        activityShareOnline: false,
        activityDefaultSharing: 'friends_all',
        activityShareGames: true,
        activityShareMusic: true
      })
      await service.updateSettings(userId, { shareEnabled: true })
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: { activityShareEnabled: true }
      })
    })
  })

  describe('listHiddenServers', () => {
    it('returns only servers explicitly hidden', async () => {
      prisma.serverMember.findMany.mockResolvedValue([
        { serverId: 's1' },
        { serverId: 's2' }
      ])
      const result = await service.listHiddenServers(userId)
      expect(prisma.serverMember.findMany).toHaveBeenCalledWith({
        where: { userId, shareActivity: false },
        select: { serverId: true }
      })
      expect(result).toEqual({ hiddenServerIds: ['s1', 's2'] })
    })
  })

  describe('setServerHidden', () => {
    it('writes shareActivity=false and emits a scope-change event when hiding', async () => {
      prisma.serverMember.update.mockResolvedValue({})
      const result = await service.setServerHidden(userId, 'srv-1', true)
      expect(prisma.serverMember.update).toHaveBeenCalledWith({
        where: { userId_serverId: { userId, serverId: 'srv-1' } },
        data: { shareActivity: false }
      })
      expect(events.emit).toHaveBeenCalledWith('activity:server-scope-changed', {
        userId,
        serverId: 'srv-1'
      })
      expect(result).toEqual({ hidden: true })
    })

    it('resets shareActivity to null when un-hiding', async () => {
      prisma.serverMember.update.mockResolvedValue({})
      await service.setServerHidden(userId, 'srv-1', false)
      expect(prisma.serverMember.update).toHaveBeenCalledWith({
        where: { userId_serverId: { userId, serverId: 'srv-1' } },
        data: { shareActivity: null }
      })
    })

    it('throws NotFound and emits nothing when membership is missing', async () => {
      prisma.serverMember.update.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('not found', {
          code: 'P2025',
          clientVersion: 'test'
        })
      )
      await expect(service.setServerHidden(userId, 'srv-x', true)).rejects.toThrow(
        NotFoundException
      )
      expect(events.emit).not.toHaveBeenCalled()
    })
  })

  describe('upsertGame', () => {
    it('marks non-manual sources as verified by default', async () => {
      prisma.registeredGame.upsert.mockImplementation(({ create }: any) => ({
        id: 'g1',
        name: create.name,
        source: create.source,
        executable: create.executable,
        steamAppId: create.steamAppId,
        iconUrl: create.iconUrl,
        verified: create.verified,
        hidden: false,
        lastPlayedAt: new Date(),
        createdAt: new Date()
      }))
      const game = await service.upsertGame(userId, { name: 'Steam Game', source: 'steam' })
      expect(game.verified).toBe(true)
      expect(game.source).toBe('steam')
    })
  })

  describe('resolveSteam', () => {
    it('rejects non-numeric appids', async () => {
      await expect(service.resolveSteam('abc')).rejects.toThrow(BadRequestException)
    })

    it('returns cached results without hitting the network', async () => {
      redis.client.get.mockResolvedValue(
        JSON.stringify({ name: 'Cached', iconUrl: 'i', headerUrl: 'h' })
      )
      const fetchSpy = jest.spyOn(global, 'fetch')
      const result = await service.resolveSteam('440')
      expect(result?.name).toBe('Cached')
      expect(fetchSpy).not.toHaveBeenCalled()
    })
  })

  describe('saveIcon', () => {
    it('rejects malformed data URLs', async () => {
      await expect(service.saveIcon('not-a-data-url', 'k')).rejects.toThrow(BadRequestException)
    })

    it('decodes and stores a valid data URL', async () => {
      uploads.saveActivityIcon.mockResolvedValue('/api/uploads/activity-icons/k.webp')
      const tinyPng = Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString('base64')
      const result = await service.saveIcon(`data:image/png;base64,${tinyPng}`, 'k')
      expect(result.url).toBe('/api/uploads/activity-icons/k.webp')
      expect(uploads.saveActivityIcon).toHaveBeenCalled()
    })
  })
})
