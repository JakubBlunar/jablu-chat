import { CanActivate, ExecutionContext, Injectable, Logger, SetMetadata } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { WsException } from '@nestjs/websockets'
import { Socket } from 'socket.io'
import { RedisService } from '../redis/redis.service'
import { WsUser } from './ws-jwt.guard'

export const WS_THROTTLE_KEY = 'ws_throttle'

export interface WsThrottleOptions {
  limit: number
  windowSeconds: number
}

const DEFAULT_THROTTLE: WsThrottleOptions = { limit: 10, windowSeconds: 10 }

const THROTTLE_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
local ttl = redis.call('TTL', KEYS[1])
if ttl < 0 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return {count, ttl}
`

export const WsThrottle = (limit: number, windowSeconds: number) =>
  SetMetadata(WS_THROTTLE_KEY, { limit, windowSeconds } satisfies WsThrottleOptions)

@Injectable()
export class WsThrottleGuard implements CanActivate {
  private readonly logger = new Logger(WsThrottleGuard.name)

  constructor(
    private readonly reflector: Reflector,
    private readonly redis: RedisService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const opts = this.reflector.get<WsThrottleOptions>(WS_THROTTLE_KEY, context.getHandler()) ?? DEFAULT_THROTTLE

    const client = context.switchToWs().getClient<Socket>()
    const user = (client.data as { user?: WsUser }).user
    if (!user) return true

    const event = context.switchToWs().getPattern()
    const key = `ws:throttle:${user.id}:${event}`

    let count: number
    let ttl: number
    try {
      const result = await this.redis.client.eval(THROTTLE_SCRIPT, 1, key, opts.windowSeconds)
      if (
        !Array.isArray(result) ||
        result.length !== 2 ||
        typeof result[0] !== 'number' ||
        typeof result[1] !== 'number' ||
        !Number.isSafeInteger(result[0]) ||
        !Number.isSafeInteger(result[1]) ||
        result[0] < 1 ||
        result[1] < 0
      ) {
        throw new Error('Invalid Redis throttle response')
      }
      count = result[0]
      ttl = result[1]
    } catch (err) {
      this.logger.warn(`Redis throttle check failed for ${event}, allowing request`, (err as Error).message)
      return true
    }

    if (count > opts.limit) {
      throw new WsException({
        message: 'Rate limit exceeded',
        event,
        retryAfter: ttl > 0 ? ttl : opts.windowSeconds
      })
    }

    return true
  }
}
