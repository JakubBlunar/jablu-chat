import { Reflector } from '@nestjs/core'
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
    guard = new WsThrottleGuard(
      reflector as unknown as Reflector,
      redis as any
    )
  })

  it('allows request when under limit', async () => {
    reflector.get.mockReturnValue({ limit: 5, windowSeconds: 5 })
    redis.client.incr.mockResolvedValue(1)

    const ctx = makeContext('user-1', 'message:send')
    const result = await guard.canActivate(ctx)

    expect(result).toBe(true)
    expect(redis.client.incr).toHaveBeenCalledWith('ws:throttle:user-1:message:send')
    expect(redis.client.expire).toHaveBeenCalledWith('ws:throttle:user-1:message:send', 5)
  })

  it('rejects request when limit exceeded', async () => {
    reflector.get.mockReturnValue({ limit: 5, windowSeconds: 5 })
    redis.client.incr.mockResolvedValue(6)
    redis.client.ttl.mockResolvedValue(3)

    const ctx = makeContext('user-1', 'message:send')
    const result = await guard.canActivate(ctx)

    expect(result).toBe(false)
    expect(mockEmit).toHaveBeenCalledWith('exception', {
      status: 'error',
      message: 'Rate limit exceeded',
      event: 'message:send',
      retryAfter: 3
    })
  })

  it('uses correct Redis key format', async () => {
    reflector.get.mockReturnValue({ limit: 10, windowSeconds: 10 })
    redis.client.incr.mockResolvedValue(1)

    const ctx = makeContext('abc-123', 'dm:send')
    await guard.canActivate(ctx)

    expect(redis.client.incr).toHaveBeenCalledWith('ws:throttle:abc-123:dm:send')
  })

  it('sets TTL on first increment only', async () => {
    reflector.get.mockReturnValue({ limit: 5, windowSeconds: 10 })
    redis.client.incr.mockResolvedValue(3)

    const ctx = makeContext('user-1', 'typing:start')
    await guard.canActivate(ctx)

    expect(redis.client.expire).not.toHaveBeenCalled()
  })

  it('falls back to default limit when no decorator metadata', async () => {
    reflector.get.mockReturnValue(undefined)
    redis.client.incr.mockResolvedValue(11)
    redis.client.ttl.mockResolvedValue(8)

    const ctx = makeContext('user-1', 'some:event')
    const result = await guard.canActivate(ctx)

    expect(result).toBe(false)
  })

  it('reads custom limits from metadata', async () => {
    reflector.get.mockReturnValue({ limit: 3, windowSeconds: 2 })
    redis.client.incr.mockResolvedValue(4)
    redis.client.ttl.mockResolvedValue(1)

    const ctx = makeContext('user-1', 'message:send')
    const result = await guard.canActivate(ctx)

    expect(result).toBe(false)
    expect(reflector.get).toHaveBeenCalledWith(WS_THROTTLE_KEY, expect.anything())
  })

  it('allows within custom limit', async () => {
    reflector.get.mockReturnValue({ limit: 3, windowSeconds: 2 })
    redis.client.incr.mockResolvedValue(3)

    const ctx = makeContext('user-1', 'message:send')
    const result = await guard.canActivate(ctx)

    expect(result).toBe(true)
  })

  it('gracefully allows on Redis failure', async () => {
    reflector.get.mockReturnValue({ limit: 5, windowSeconds: 5 })
    redis.client.incr.mockRejectedValue(new Error('Connection refused'))

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
    expect(redis.client.incr).not.toHaveBeenCalled()
  })

  it('uses window seconds as retryAfter when TTL is non-positive', async () => {
    reflector.get.mockReturnValue({ limit: 5, windowSeconds: 7 })
    redis.client.incr.mockResolvedValue(6)
    redis.client.ttl.mockResolvedValue(-1)

    const ctx = makeContext('user-1', 'message:send')
    await guard.canActivate(ctx)

    expect(mockEmit).toHaveBeenCalledWith('exception', expect.objectContaining({
      retryAfter: 7
    }))
  })
})
