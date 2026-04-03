import { HttpException } from '@nestjs/common'
import { BotRateLimiterGuard } from './bot-rate-limiter'
import { createMockRedisService, MockRedisService } from '../__mocks__/redis.mock'

describe('BotRateLimiterGuard', () => {
  let guard: BotRateLimiterGuard
  let redis: MockRedisService

  function makeContext(user?: { id: string }) {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    } as any
  }

  beforeEach(() => {
    redis = createMockRedisService()
    guard = new BotRateLimiterGuard(redis as any)
  })

  it('allows request when no user is present', async () => {
    const result = await guard.canActivate(makeContext(undefined))
    expect(result).toBe(true)
  })

  it('allows first request and sets expiry', async () => {
    redis.client.incr.mockResolvedValue(1)
    redis.client.expire.mockResolvedValue(1)

    const result = await guard.canActivate(makeContext({ id: 'bot1' }))

    expect(result).toBe(true)
    expect(redis.client.incr).toHaveBeenCalledWith('ratelimit:bot:bot1')
    expect(redis.client.expire).toHaveBeenCalledWith('ratelimit:bot:bot1', 60)
  })

  it('allows requests under the limit', async () => {
    redis.client.incr.mockResolvedValue(15)

    const result = await guard.canActivate(makeContext({ id: 'bot1' }))

    expect(result).toBe(true)
    expect(redis.client.expire).not.toHaveBeenCalled()
  })

  it('throws 429 when over limit', async () => {
    redis.client.incr.mockResolvedValue(31)
    redis.client.ttl.mockResolvedValue(45)

    await expect(guard.canActivate(makeContext({ id: 'bot1' }))).rejects.toThrow(HttpException)

    try {
      await guard.canActivate(makeContext({ id: 'bot1' }))
    } catch (err: any) {
      expect(err.getStatus()).toBe(429)
      expect(err.getResponse()).toEqual({ message: 'Too many requests', retryAfter: 45 })
    }
  })

  it('uses window seconds as retryAfter when TTL is not positive', async () => {
    redis.client.incr.mockResolvedValue(31)
    redis.client.ttl.mockResolvedValue(-1)

    try {
      await guard.canActivate(makeContext({ id: 'bot1' }))
    } catch (err: any) {
      expect(err.getResponse()).toEqual({ message: 'Too many requests', retryAfter: 60 })
    }
  })

  it('allows request when Redis is not ready', async () => {
    redis.client.status = 'connecting'

    const result = await guard.canActivate(makeContext({ id: 'bot1' }))

    expect(result).toBe(true)
    expect(redis.client.incr).not.toHaveBeenCalled()
  })

  it('allows request when Redis throws non-HttpException', async () => {
    redis.client.incr.mockRejectedValue(new Error('connection lost'))

    const result = await guard.canActivate(makeContext({ id: 'bot1' }))

    expect(result).toBe(true)
  })
})
