import { RedisService } from '../redis/redis.service'

export type MockRedisClient = {
  get: jest.Mock
  set: jest.Mock
  del: jest.Mock
  incr: jest.Mock
  expire: jest.Mock
  ping: jest.Mock
  ttl: jest.Mock
  setex: jest.Mock
  exists: jest.Mock
  keys: jest.Mock
  mget: jest.Mock
}

export type MockRedisService = {
  client: MockRedisClient
  isHealthy: jest.Mock
}

export function createMockRedisClient(): MockRedisClient {
  return {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    incr: jest.fn(),
    expire: jest.fn(),
    ping: jest.fn().mockResolvedValue('PONG'),
    ttl: jest.fn(),
    setex: jest.fn(),
    exists: jest.fn(),
    keys: jest.fn(),
    mget: jest.fn(),
  }
}

export function createMockRedisService(): MockRedisService {
  return {
    client: createMockRedisClient(),
    isHealthy: jest.fn().mockResolvedValue(true),
  } as unknown as MockRedisService
}
