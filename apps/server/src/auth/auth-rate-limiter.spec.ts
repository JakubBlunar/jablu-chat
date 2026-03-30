import { Test, TestingModule } from '@nestjs/testing'
import { AuthRateLimiter } from './auth-rate-limiter'
import { RedisService } from '../redis/redis.service'
import { createMockRedisService, MockRedisService } from '../__mocks__/redis.mock'

describe('AuthRateLimiter', () => {
  let limiter: AuthRateLimiter
  let redis: MockRedisService

  beforeEach(async () => {
    redis = createMockRedisService()

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthRateLimiter,
        { provide: RedisService, useValue: redis },
      ],
    }).compile()

    limiter = module.get(AuthRateLimiter)
  })

  describe('check', () => {
    it('allows when no lock exists', async () => {
      redis.client.get.mockResolvedValue(null)
      const result = await limiter.check('192.168.1.1')
      expect(result).toEqual({ allowed: true })
    })

    it('blocks when lock is active with retryAfter', async () => {
      const lockUntil = Date.now() + 300_000 // 5 min from now
      redis.client.get.mockResolvedValue(String(lockUntil))

      const result = await limiter.check('192.168.1.1')
      expect(result.allowed).toBe(false)
      expect(result.retryAfter).toBeGreaterThan(0)
      expect(result.retryAfter).toBeLessThanOrEqual(300)
    })

    it('clears an expired lock and allows', async () => {
      const lockUntil = Date.now() - 1000 // expired
      redis.client.get.mockResolvedValue(String(lockUntil))
      redis.client.del.mockResolvedValue(1)

      const result = await limiter.check('192.168.1.1')
      expect(result).toEqual({ allowed: true })
      expect(redis.client.del).toHaveBeenCalledWith('ratelimit:auth:192.168.1.1:lock')
    })

    it('allows when Redis fails (graceful degradation)', async () => {
      redis.client.get.mockRejectedValue(new Error('connection lost'))
      const result = await limiter.check('192.168.1.1')
      expect(result).toEqual({ allowed: true })
    })
  })

  describe('recordFailure', () => {
    it('increments counter and sets TTL', async () => {
      redis.client.incr.mockResolvedValue(1)
      redis.client.expire.mockResolvedValue(1)

      const result = await limiter.recordFailure('192.168.1.1')
      expect(result).toEqual({})
      expect(redis.client.incr).toHaveBeenCalledWith('ratelimit:auth:192.168.1.1:count')
      expect(redis.client.expire).toHaveBeenCalledWith('ratelimit:auth:192.168.1.1:count', 7200)
    })

    it('does not lock below threshold (count < 10)', async () => {
      redis.client.incr.mockResolvedValue(9)
      redis.client.expire.mockResolvedValue(1)

      const result = await limiter.recordFailure('192.168.1.1')
      expect(result).toEqual({})
      expect(redis.client.set).not.toHaveBeenCalled()
    })

    it('locks for 5 minutes at 10 attempts', async () => {
      redis.client.incr.mockResolvedValue(10)
      redis.client.expire.mockResolvedValue(1)
      redis.client.set.mockResolvedValue('OK')

      const result = await limiter.recordFailure('192.168.1.1')
      expect(result.retryAfter).toBe(300) // 5 * 60
      expect(redis.client.set).toHaveBeenCalledWith(
        'ratelimit:auth:192.168.1.1:lock',
        expect.any(String),
        'EX',
        300,
      )
    })

    it('escalates to 30 minutes at 20 attempts', async () => {
      redis.client.incr.mockResolvedValue(20)
      redis.client.expire.mockResolvedValue(1)
      redis.client.set.mockResolvedValue('OK')

      const result = await limiter.recordFailure('192.168.1.1')
      expect(result.retryAfter).toBe(1800) // 30 * 60
    })

    it('escalates to 2 hours at 40 attempts', async () => {
      redis.client.incr.mockResolvedValue(40)
      redis.client.expire.mockResolvedValue(1)
      redis.client.set.mockResolvedValue('OK')

      const result = await limiter.recordFailure('192.168.1.1')
      expect(result.retryAfter).toBe(7200) // 2 * 60 * 60
    })

    it('returns empty on Redis failure', async () => {
      redis.client.incr.mockRejectedValue(new Error('connection lost'))
      const result = await limiter.recordFailure('192.168.1.1')
      expect(result).toEqual({})
    })
  })

  describe('resetOnSuccess', () => {
    it('deletes count and lock keys', async () => {
      redis.client.del.mockResolvedValue(2)
      await limiter.resetOnSuccess('192.168.1.1')
      expect(redis.client.del).toHaveBeenCalledWith(
        'ratelimit:auth:192.168.1.1:count',
        'ratelimit:auth:192.168.1.1:lock',
      )
    })

    it('does not throw on Redis failure', async () => {
      redis.client.del.mockRejectedValue(new Error('connection lost'))
      await expect(limiter.resetOnSuccess('192.168.1.1')).resolves.toBeUndefined()
    })
  })
})
