import { ConfigService } from '@nestjs/config'
import Redis from 'ioredis'
import { RedisService } from './redis.service'

jest.mock('ioredis')

const MockRedis = Redis as unknown as jest.Mock

describe('RedisService', () => {
  let ping: jest.Mock
  let quit: jest.Mock
  let on: jest.Mock

  beforeEach(() => {
    ping = jest.fn().mockResolvedValue('PONG')
    quit = jest.fn().mockResolvedValue('OK')
    on = jest.fn()
    MockRedis.mockReset()
    MockRedis.mockImplementation(() => ({ ping, quit, on }))
  })

  function makeService(url?: string) {
    return new RedisService({
      get: (_key: string, fallback?: string) => url ?? fallback ?? 'redis://localhost:6379'
    } as ConfigService)
  }

  it('constructs the client with a short retry budget and no offline queue', () => {
    makeService('redis://cache:6379')

    expect(MockRedis).toHaveBeenCalledWith(
      'redis://cache:6379',
      expect.objectContaining({
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false
      })
    )
  })

  it('treats a string PONG ping as healthy', async () => {
    const service = makeService()
    await expect(service.isHealthy()).resolves.toBe(true)
  })

  it('treats a failed ping as unhealthy', async () => {
    ping.mockRejectedValue(new Error('ECONNREFUSED'))
    const service = makeService()
    await expect(service.isHealthy()).resolves.toBe(false)
  })

  it('quits the client on destroy', async () => {
    const service = makeService()
    await service.onModuleDestroy()
    expect(quit).toHaveBeenCalled()
  })
})
