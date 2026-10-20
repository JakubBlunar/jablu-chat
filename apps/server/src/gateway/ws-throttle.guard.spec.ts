import { Reflector } from '@nestjs/core'
import { WsException } from '@nestjs/websockets'
import { createMockRedisService, MockRedisService } from '../__mocks__/redis.mock'
import { WS_THROTTLE_KEY, WsThrottleGuard } from './ws-throttle.guard'

describe('WsThrottleGuard', () => {
  let guard: WsThrottleGuard
  let redis: MockRedisService
  let reflector: { get: jest.Mock }
  let mockEmit: jest.Mock

  function makeContext(userId: string, event: string) {
    mockEmit = jest.fn()
    return {
      getHandler: () => ({}),
      switchToWs: () => ({
        getClient: () => ({
          data: { user: { id: userId, username: 'test', displayName: null } },
          emit: mockEmit
        }),
        getPattern: () => event
      })
    } as any
  }

  beforeEach(() => {
    redis = createMockRedisService()
    reflector = { get: jest.fn() }
    guard = new WsThrottleGuard(reflector as unknown as Reflector, redis as any)
  })

  it('allows request when under limit', async () => {
    reflector.get.mockReturnValue({ limit: 5, windowSeconds: 5 })
    redis.client.eval.mockResolvedValue([1, 5])

    const ctx = makeContext('user-1', 'message:send')
    const result = await guard.canActivate(ctx)

    expect(result).toBe(true)
    expect(redis.client.eval).toHaveBeenCalledWith(
      expect.stringContaining("redis.call('EXPIRE'"),
      1,
      'ws:throttle:user-1:message:send',
      5
    )
  })

  it('rejects request when limit exceeded', async () => {
    reflector.get.mockReturnValue({ limit: 5, windowSeconds: 5 })
    redis.client.eval.mockResolvedValue([6, 3])

    const ctx = makeContext('user-1', 'message:send')
    await expect(guard.canActivate(ctx)).rejects.toMatchObject({
      error: { message: 'Rate limit exceeded', event: 'message:send', retryAfter: 3 }
    })
    expect(mockEmit).not.toHaveBeenCalled()
  })

  it('uses correct Redis key format', async () => {
    reflector.get.mockReturnValue({ limit: 10, windowSeconds: 10 })
    redis.client.eval.mockResolvedValue([1, 10])

    const ctx = makeContext('abc-123', 'dm:send')
    await guard.canActivate(ctx)

    expect(redis.client.eval).toHaveBeenCalledWith(expect.any(String), 1, 'ws:throttle:abc-123:dm:send', 10)
  })

  it('updates the counter and expiry in one atomic Redis operation', async () => {
    reflector.get.mockReturnValue({ limit: 5, windowSeconds: 10 })
    redis.client.eval.mockResolvedValue([3, 6])

    const ctx = makeContext('user-1', 'typing:start')
    await guard.canActivate(ctx)

    expect(redis.client.eval).toHaveBeenCalledTimes(1)
    expect(redis.client.incr).not.toHaveBeenCalled()
    expect(redis.client.expire).not.toHaveBeenCalled()
    expect(redis.client.ttl).not.toHaveBeenCalled()
  })

  it('falls back to default limit when no decorator metadata', async () => {
    reflector.get.mockReturnValue(undefined)
    redis.client.eval.mockResolvedValue([11, 8])

    const ctx = makeContext('user-1', 'some:event')
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(WsException)
    expect(redis.client.eval).toHaveBeenCalledWith(expect.any(String), 1, 'ws:throttle:user-1:some:event', 10)
  })

  it('reads custom limits from metadata', async () => {
    reflector.get.mockReturnValue({ limit: 3, windowSeconds: 2 })
    redis.client.eval.mockResolvedValue([4, 1])

    const ctx = makeContext('user-1', 'message:send')
    await expect(guard.canActivate(ctx)).rejects.toThrow('Rate limit exceeded')
    expect(reflector.get).toHaveBeenCalledWith(WS_THROTTLE_KEY, expect.anything())
  })

  it('allows within custom limit', async () => {
    reflector.get.mockReturnValue({ limit: 3, windowSeconds: 2 })
    redis.client.eval.mockResolvedValue([3, 2])

    const ctx = makeContext('user-1', 'message:send')
    const result = await guard.canActivate(ctx)

    expect(result).toBe(true)
  })

  it('gracefully allows on Redis failure', async () => {
    reflector.get.mockReturnValue({ limit: 5, windowSeconds: 5 })
    redis.client.eval.mockRejectedValue(new Error('Connection refused'))

    const ctx = makeContext('user-1', 'message:send')
    const result = await guard.canActivate(ctx)

    expect(result).toBe(true)
  })

  it('allows request when user is not authenticated', async () => {
    reflector.get.mockReturnValue({ limit: 5, windowSeconds: 5 })

    const ctx = {
      getHandler: () => ({}),
      switchToWs: () => ({
        getClient: () => ({ data: {}, emit: jest.fn() }),
        getPattern: () => 'message:send'
      })
    } as any

    const result = await guard.canActivate(ctx)
    expect(result).toBe(true)
    expect(redis.client.eval).not.toHaveBeenCalled()
  })

  it('uses window seconds as retryAfter when TTL is non-positive', async () => {
    reflector.get.mockReturnValue({ limit: 5, windowSeconds: 7 })
    redis.client.eval.mockResolvedValue([6, 0])

    const ctx = makeContext('user-1', 'message:send')
    await expect(guard.canActivate(ctx)).rejects.toMatchObject({ error: { retryAfter: 7 } })
  })

  it('logs an invalid Redis result and preserves the existing fail-open behavior', async () => {
    redis.client.eval.mockResolvedValue(['invalid', 5])
    expect(await guard.canActivate(makeContext('user-1', 'dm:call:sync'))).toBe(true)
  })
})
