import { Test, TestingModule } from '@nestjs/testing'
import { ConfigService } from '@nestjs/config'
import * as webPush from 'web-push'
import { PushService } from './push.service'
import { PrismaService } from '../prisma/prisma.service'
import { RedisService } from '../redis/redis.service'
import { createMockPrismaService, MockPrismaService } from '../__mocks__/prisma.mock'
import { createMockRedisService, MockRedisService } from '../__mocks__/redis.mock'

jest.mock('web-push', () => ({
  setVapidDetails: jest.fn(),
  sendNotification: jest.fn()
}))

const mockWebPush = jest.mocked(webPush)

describe('PushService', () => {
  let service: PushService
  let prisma: MockPrismaService
  let redis: MockRedisService
  let config: Record<string, string>

  beforeEach(async () => {
    prisma = createMockPrismaService()
    redis = createMockRedisService()
    config = {
      VAPID_PUBLIC_KEY: 'pub-key',
      VAPID_PRIVATE_KEY: 'priv-key',
      SERVER_HOST: 'example.com'
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PushService,
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: redis },
        {
          provide: ConfigService,
          useValue: { get: (key: string, fallback?: string) => config[key] ?? fallback }
        }
      ]
    }).compile()

    service = module.get(PushService)
  })

  afterEach(async () => {
    await service.onModuleDestroy()
  })

  describe('getVapidPublicKey', () => {
    it('returns the configured public key', () => {
      expect(service.getVapidPublicKey()).toBe('pub-key')
    })

    it('returns null when not configured', () => {
      config.VAPID_PUBLIC_KEY = ''
      expect(service.getVapidPublicKey()).toBeFalsy()
    })
  })

  describe('subscribe', () => {
    it('upserts a new subscription', async () => {
      prisma.pushSubscription.findUnique.mockResolvedValue(null)
      prisma.pushSubscription.upsert.mockResolvedValue({})

      await service.subscribe('u1', 'https://push.example.com', 'p256', 'auth')

      expect(prisma.pushSubscription.upsert).toHaveBeenCalledWith({
        where: { endpoint: 'https://push.example.com' },
        create: { userId: 'u1', endpoint: 'https://push.example.com', p256dh: 'p256', auth: 'auth' },
        update: { p256dh: 'p256', auth: 'auth' }
      })
    })

    it('deletes existing subscription from different user before upserting', async () => {
      prisma.pushSubscription.findUnique.mockResolvedValue({ userId: 'other-user', endpoint: 'https://push.example.com' })
      prisma.pushSubscription.delete.mockResolvedValue({})
      prisma.pushSubscription.upsert.mockResolvedValue({})

      await service.subscribe('u1', 'https://push.example.com', 'p256', 'auth')

      expect(prisma.pushSubscription.delete).toHaveBeenCalledWith({
        where: { endpoint: 'https://push.example.com' }
      })
    })

    it('does not delete when existing subscription belongs to same user', async () => {
      prisma.pushSubscription.findUnique.mockResolvedValue({ userId: 'u1', endpoint: 'https://push.example.com' })
      prisma.pushSubscription.upsert.mockResolvedValue({})

      await service.subscribe('u1', 'https://push.example.com', 'p256', 'auth')

      expect(prisma.pushSubscription.delete).not.toHaveBeenCalled()
    })
  })

  describe('unsubscribe', () => {
    it('deletes the subscription', async () => {
      prisma.pushSubscription.deleteMany.mockResolvedValue({ count: 1 })

      await service.unsubscribe('https://push.example.com', 'u1')

      expect(prisma.pushSubscription.deleteMany).toHaveBeenCalledWith({
        where: { endpoint: 'https://push.example.com', userId: 'u1' }
      })
    })

    it('does not throw when subscription does not exist', async () => {
      prisma.pushSubscription.deleteMany.mockRejectedValue(new Error('not found'))
      await expect(service.unsubscribe('https://push.example.com', 'u1')).resolves.toBeUndefined()
    })
  })

  describe('sendToUsers', () => {
    it('does nothing for empty user list', async () => {
      await service.sendToUsers([], { title: 'T', body: 'B' })
      expect(redis.client.rpush).not.toHaveBeenCalled()
    })

    it('does not enqueue when push is suppressed for all recipients', async () => {
      service.onModuleInit()
      prisma.user.findMany.mockResolvedValue([
        {
          id: 'u1',
          pushSuppressAll: true,
          pushQuietHoursEnabled: false,
          pushQuietHoursTz: null,
          pushQuietHoursStartMin: 0,
          pushQuietHoursEndMin: 0
        }
      ])
      await service.sendToUsers(['u1'], { title: 'T', body: 'B' })
      expect(redis.client.rpush).not.toHaveBeenCalled()
    })
  })

  describe('onModuleInit', () => {
    it('sets VAPID details when keys are configured', () => {
      service.onModuleInit()

      expect(mockWebPush.setVapidDetails).toHaveBeenCalledWith(
        'mailto:admin@example.com',
        'pub-key',
        'priv-key'
      )
    })

    it('skips VAPID when keys are missing', () => {
      config.VAPID_PUBLIC_KEY = ''
      config.VAPID_PRIVATE_KEY = ''
      jest.clearAllMocks()

      service.onModuleInit()

      expect(mockWebPush.setVapidDetails).not.toHaveBeenCalled()
    })
  })

  describe('processJob (via enqueue inline fallback)', () => {
    beforeEach(() => {
      service.onModuleInit()
      prisma.user.findMany.mockImplementation((args: { where?: { id?: { in: string[] } } }) => {
        const ids = args?.where?.id?.in ?? []
        return Promise.resolve(
          ids.map((id) => ({
            id,
            pushSuppressAll: false,
            pushQuietHoursEnabled: false,
            pushQuietHoursTz: null,
            pushQuietHoursStartMin: 0,
            pushQuietHoursEndMin: 0
          }))
        )
      })
    })

    it('cleans up stale subscriptions on 410', async () => {
      redis.client.rpush.mockRejectedValue(new Error('redis down'))
      prisma.pushSubscription.findMany.mockResolvedValue([
        { id: 'sub1', userId: 'u1', endpoint: 'ep1', p256dh: 'p', auth: 'a' }
      ])
      mockWebPush.sendNotification.mockRejectedValue({ statusCode: 410 })
      prisma.pushSubscription.deleteMany.mockResolvedValue({ count: 1 })

      await service.sendToUser('u1', { title: 'T', body: 'B' })

      expect(prisma.pushSubscription.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['sub1'] } }
      })
    })

    it('does not clean up on non-410 errors', async () => {
      redis.client.rpush.mockRejectedValue(new Error('redis down'))
      prisma.pushSubscription.findMany.mockResolvedValue([
        { id: 'sub1', userId: 'u1', endpoint: 'ep1', p256dh: 'p', auth: 'a' }
      ])
      mockWebPush.sendNotification.mockRejectedValue({ statusCode: 500 })

      await service.sendToUser('u1', { title: 'T', body: 'B' })

      expect(prisma.pushSubscription.deleteMany).not.toHaveBeenCalled()
    })

    it('skips when no subscriptions found', async () => {
      redis.client.rpush.mockRejectedValue(new Error('redis down'))
      prisma.pushSubscription.findMany.mockResolvedValue([])
      mockWebPush.sendNotification.mockClear()

      await service.sendToUser('u1', { title: 'T', body: 'B' })

      expect(mockWebPush.sendNotification).not.toHaveBeenCalled()
    })
  })
})
