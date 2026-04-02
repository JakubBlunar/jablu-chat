import { CanActivate, ExecutionContext, HttpException, Injectable, Logger } from '@nestjs/common'
import { RedisService } from '../redis/redis.service'

const WINDOW_SECONDS = 60
const MAX_REQUESTS = 30
const KEY_PREFIX = 'ratelimit:bot:'

@Injectable()
export class BotRateLimiterGuard implements CanActivate {
  private readonly logger = new Logger(BotRateLimiterGuard.name)

  constructor(private readonly redis: RedisService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest()
    const userId = req.user?.id
    if (!userId) return true

    try {
      if (this.redis.client.status !== 'ready') return true

      const key = `${KEY_PREFIX}${userId}`
      const count = await this.redis.client.incr(key)
      if (count === 1) {
        await this.redis.client.expire(key, WINDOW_SECONDS)
      }

      if (count > MAX_REQUESTS) {
        const ttl = await this.redis.client.ttl(key)
        throw new HttpException({ message: 'Too many requests', retryAfter: ttl > 0 ? ttl : WINDOW_SECONDS }, 429)
      }
    } catch (err) {
      if (err instanceof HttpException) throw err
      this.logger.warn('Rate limit check failed, allowing request')
    }

    return true
  }
}
