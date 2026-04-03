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
  hgetall: jest.Mock
  hmset: jest.Mock
  rpush: jest.Mock
  blpop: jest.Mock
  status: string
  duplicate: jest.Mock
  on: jest.Mock
  quit: jest.Mock
}

export type MockRedisService = {
  client: MockRedisClient
  isHealthy: jest.Mock
}

export function createMockRedisClient(): MockRedisClient {
  const client: MockRedisClient = {
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
    hgetall: jest.fn(),
    hmset: jest.fn(),
    rpush: jest.fn(),
    blpop: jest.fn(),
    status: 'ready',
    duplicate: jest.fn(),
    on: jest.fn().mockReturnThis(),
    quit: jest.fn().mockResolvedValue('OK'),
  }
  client.duplicate.mockReturnValue(client)
  return client
}

export function createMockRedisService(): MockRedisService {
  return {
    client: createMockRedisClient(),
    isHealthy: jest.fn().mockResolvedValue(true),
  } as unknown as MockRedisService
}
