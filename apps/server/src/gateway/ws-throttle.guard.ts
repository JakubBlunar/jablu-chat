import { CanActivate, ExecutionContext, Injectable, Logger, SetMetadata } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Socket } from 'socket.io'
import { RedisService } from '../redis/redis.service'
import { WsUser } from './ws-jwt.guard'

export const WS_THROTTLE_KEY = 'ws_throttle'

export interface WsThrottleOptions {
  limit: number
  windowSeconds: number
}

const DEFAULT_THROTTLE: WsThrottleOptions = { limit: 10, windowSeconds: 10 }

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
    const opts =
      this.reflector.get<WsThrottleOptions>(WS_THROTTLE_KEY, context.getHandler()) ?? DEFAULT_THROTTLE

    const client = context.switchToWs().getClient<Socket>()
    const user = (client.data as { user?: WsUser }).user
    if (!user) return true

    const event = context.switchToWs().getPattern()
    const key = `ws:throttle:${user.id}:${event}`

    try {
      const count = await this.redis.client.incr(key)
      if (count === 1) {
        await this.redis.client.expire(key, opts.windowSeconds)
      }

      if (count > opts.limit) {
        const ttl = await this.redis.client.ttl(key)
        client.emit('exception', {
          status: 'error',
          message: 'Rate limit exceeded',
          event,
          retryAfter: ttl > 0 ? ttl : opts.windowSeconds
        })
        return false
      }

      return true
    } catch (err) {
      this.logger.warn(`Redis throttle check failed for ${event}, allowing request`, (err as Error).message)
      return true
    }
  }
}
