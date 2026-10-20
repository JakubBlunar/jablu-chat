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
  let deliverQueuedJob: (job: [string, string] | null) => void

  beforeEach(async () => {
    prisma = createMockPrismaService()
    redis = createMockRedisService()
    redis.client.blpop.mockImplementation(
      () =>
        new Promise((resolve) => {
          deliverQueuedJob = resolve
        })
    )
    mockWebPush.sendNotification.mockReset()
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
        create: {
          userId: 'u1',
          endpoint: 'https://push.example.com',
          p256dh: 'p256',
          auth: 'auth',
          deviceId: null,
          locale: 'en'
        },
        update: { p256dh: 'p256', auth: 'auth', locale: 'en' }
      })
    })

    it('stores the deviceId when the client supplies one', async () => {
      prisma.pushSubscription.findUnique.mockResolvedValue(null)
      prisma.pushSubscription.upsert.mockResolvedValue({})

      await service.subscribe('u1', 'https://push.example.com', 'p256', 'auth', 'device-9', 'cs')

      expect(prisma.pushSubscription.upsert).toHaveBeenCalledWith({
        where: { endpoint: 'https://push.example.com' },
        create: {
          userId: 'u1',
          endpoint: 'https://push.example.com',
          p256dh: 'p256',
          auth: 'auth',
          deviceId: 'device-9',
          locale: 'cs'
        },
        update: { p256dh: 'p256', auth: 'auth', locale: 'cs', deviceId: 'device-9' }
      })
    })

    it('uses the saved account locale instead of a different device locale', async () => {
      prisma.user.findUnique.mockResolvedValue({ locale: 'sk' })
      prisma.pushSubscription.findUnique.mockResolvedValue(null)
      prisma.pushSubscription.upsert.mockResolvedValue({})

      await service.subscribe('u1', 'https://push.example.com', 'p256', 'auth', undefined, 'cs')

      expect(prisma.pushSubscription.upsert).toHaveBeenCalledWith({
        where: { endpoint: 'https://push.example.com' },
        create: {
          userId: 'u1',
          endpoint: 'https://push.example.com',
          p256dh: 'p256',
          auth: 'auth',
          deviceId: null,
          locale: 'sk'
        },
        update: { p256dh: 'p256', auth: 'auth', locale: 'sk' }
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

    it('splits a large fan-out into jobs of at most 100 recipients', async () => {
      const ids = Array.from({ length: 5000 }, (_, i) => `u${i}`)
      await service.sendToUsers(ids, { title: 'T', body: 'B' })
      const key = redis.client.rpush.mock.calls[0][0]
      const jsonJobs: string[] = redis.client.rpush.mock.calls[0].slice(1)
      const jobs = jsonJobs.map((json: string) => JSON.parse(json) as { userIds: string[] })
      expect(key).toBe('push:queue')
      expect(jobs).toHaveLength(50)
      expect(jobs.every((job) => job.userIds.length <= 100)).toBe(true)
      expect(jobs.flatMap((job) => job.userIds)).toEqual(ids)
    })

    it('limits concurrent requests across simultaneous inline-fallback jobs', async () => {
      redis.client.rpush.mockRejectedValue(new Error('redis down'))
      prisma.pushSubscription.findMany.mockResolvedValue(Array.from({ length: 75 }, (_, i) => ({
        id: `sub${i}`, userId: 'u1', endpoint: `ep${i}`, p256dh: 'p', auth: 'a'
      })))
      let active = 0
      let peak = 0
      mockWebPush.sendNotification.mockImplementation(async () => {
        active++
        peak = Math.max(peak, active)
        await new Promise<void>((resolve) => setImmediate(resolve))
        active--
        return {} as webPush.SendResult
      })
      await Promise.all([
        service.sendToUser('u1', { title: 'A', body: 'B' }),
        service.sendToUser('u2', { title: 'B', body: 'B' })
      ])
      expect(mockWebPush.sendNotification).toHaveBeenCalledTimes(150)
      expect(peak).toBe(20)
      expect(active).toBe(0)
    })

    it('releases concurrency slots after transport errors', async () => {
      redis.client.rpush.mockRejectedValue(new Error('redis down'))
      prisma.pushSubscription.findMany.mockResolvedValue(Array.from({ length: 45 }, (_, i) => ({
        id: `sub${i}`, endpoint: `ep${i}`, p256dh: 'p', auth: 'a'
      })))
      mockWebPush.sendNotification.mockRejectedValue(new Error('timeout'))
      await service.sendToUser('u1', { title: 'T', body: 'B' })
      expect(mockWebPush.sendNotification).toHaveBeenCalledTimes(45)
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

    it('keeps the normal one-hour TTL for message notifications', async () => {
      redis.client.rpush.mockRejectedValue(new Error('redis down'))
      prisma.pushSubscription.findMany.mockResolvedValue([{ id: 'sub1', endpoint: 'ep1', p256dh: 'p', auth: 'a' }])
      mockWebPush.sendNotification.mockResolvedValue({} as webPush.SendResult)
      await service.sendToUser('u1', { title: 'T', body: 'B' })
      expect(mockWebPush.sendNotification).toHaveBeenCalledWith(
        expect.anything(),
        JSON.stringify({ title: 'T', body: 'B' }),
        { TTL: 3600, urgency: 'high', timeout: 10_000 }
      )
    })

    it('queues one localized copy per recipient language group, not the full locale map', async () => {
      service.onModuleInit()
      redis.client.rpush.mockResolvedValue(3)
      prisma.user.findMany.mockImplementation((args: {
        where?: { id?: { in: string[] } }
        select?: { locale?: boolean }
      }) => {
        const ids = args?.where?.id?.in ?? []
        if (args?.select?.locale) {
          return Promise.resolve([
            { id: 'u-en', locale: 'en' },
            { id: 'u-cs', locale: 'cs' },
            { id: 'u-sk', locale: 'sk' }
          ])
        }
        return Promise.resolve(ids.map((id) => ({
          id,
          pushSuppressAll: false,
          pushQuietHoursEnabled: false,
          pushQuietHoursTz: null,
          pushQuietHoursStartMin: 0,
          pushQuietHoursEndMin: 0
        })))
      })

      await service.sendToUsers(['u-en', 'u-cs', 'u-sk'], {
        title: 'English title',
        body: 'English body',
        localized: {
          en: { title: 'English title', body: 'English body' },
          cs: { title: 'Český nadpis', body: 'Český text' },
          sk: { title: 'Slovenský nadpis', body: 'Slovenský text' }
        }
      })

      type QueueJob = {
          userIds: string[]
          payload: { title: string; body: string; localized?: unknown }
          attempt: number
      }
      const queued: QueueJob[] = redis.client.rpush.mock.calls[0].slice(1).map((value: string) =>
        JSON.parse(value) as QueueJob
      )
      expect(queued).toEqual([
        { userIds: ['u-en'], payload: { title: 'English title', body: 'English body' }, attempt: 0 },
        { userIds: ['u-cs'], payload: { title: 'Český nadpis', body: 'Český text' }, attempt: 0 },
        { userIds: ['u-sk'], payload: { title: 'Slovenský nadpis', body: 'Slovenský text' }, attempt: 0 }
      ])
      expect(queued.every((job: QueueJob) => job.payload.localized === undefined)).toBe(true)
    })

    it('limits call push TTL to the remaining ringing time', async () => {
      const now = Date.now()
      const clock = jest.spyOn(Date, 'now').mockReturnValue(now)
      try {
        redis.client.rpush.mockRejectedValue(new Error('redis down'))
        prisma.pushSubscription.findMany.mockImplementation(async () => {
          clock.mockReturnValue(now + 5000)
          return [{ id: 'sub1', endpoint: 'ep1', p256dh: 'p', auth: 'a' }]
        })
        mockWebPush.sendNotification.mockResolvedValue({} as webPush.SendResult)
        const payload = { title: 'Call', body: 'Join', expiresAt: now + 30_000 }
        await service.sendToUser('u1', payload)
        expect(mockWebPush.sendNotification).toHaveBeenCalledWith(expect.anything(), JSON.stringify(payload), {
          TTL: 25,
          urgency: 'high',
          timeout: 10_000
        })
      } finally {
        clock.mockRestore()
      }
    })

    it('does not queue an already expired call push', async () => {
      await service.sendToUser('u1', { title: 'Call', body: 'Join', expiresAt: Date.now() - 1 })
      expect(redis.client.rpush).not.toHaveBeenCalled()
      expect(mockWebPush.sendNotification).not.toHaveBeenCalled()
    })

    it('drops a queued call push if the ringing deadline passed before processing', async () => {
      const now = Date.now()
      const clock = jest.spyOn(Date, 'now').mockReturnValue(now)
      try {
        await service.sendToUser('u1', { title: 'Call', body: 'Join', expiresAt: now + 30_000 })
        const [key, json] = redis.client.rpush.mock.calls[0] as [string, string]
        clock.mockReturnValue(now + 30_001)
        deliverQueuedJob([key, json])
        await Promise.resolve()
        await Promise.resolve()
        expect(redis.client.blpop).toHaveBeenCalledTimes(2)
        expect(prisma.pushSubscription.findMany).not.toHaveBeenCalled()
        expect(mockWebPush.sendNotification).not.toHaveBeenCalled()
      } finally {
        clock.mockRestore()
      }
    })

    it('does not deliver if a subscription lookup runs past the call deadline', async () => {
      const now = Date.now()
      const clock = jest.spyOn(Date, 'now').mockReturnValue(now)
      try {
        redis.client.rpush.mockRejectedValue(new Error('redis down'))
        prisma.pushSubscription.findMany.mockImplementation(async () => {
          clock.mockReturnValue(now + 30_000)
          return [{ id: 'sub1', endpoint: 'ep1', p256dh: 'p', auth: 'a' }]
        })
        await service.sendToUser('u1', { title: 'Call', body: 'Join', expiresAt: now + 30_000 })
        expect(mockWebPush.sendNotification).not.toHaveBeenCalled()
      } finally {
        clock.mockRestore()
      }
    })
  })
})
