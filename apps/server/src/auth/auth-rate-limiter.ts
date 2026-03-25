import { Injectable, Logger } from '@nestjs/common'
import { RedisService } from '../redis/redis.service'

const MAX_ATTEMPTS_BEFORE_LOCK = 10
const ESCALATION_THRESHOLDS = [
  { attempts: 10, lockSeconds: 5 * 60 },
  { attempts: 20, lockSeconds: 30 * 60 },
  { attempts: 40, lockSeconds: 2 * 60 * 60 }
]
const KEY_PREFIX = 'ratelimit:auth:'
const STALE_TTL = 2 * 60 * 60

@Injectable()
export class AuthRateLimiter {
  private readonly logger = new Logger(AuthRateLimiter.name)

  constructor(private readonly redis: RedisService) {}

  async check(ip: string): Promise<{ allowed: boolean; retryAfter?: number }> {
    try {
      const lockUntil = await this.redis.client.get(`${KEY_PREFIX}${ip}:lock`)
      if (lockUntil) {
        const remaining = Math.ceil((Number(lockUntil) - Date.now()) / 1000)
        if (remaining > 0) return { allowed: false, retryAfter: remaining }
        await this.redis.client.del(`${KEY_PREFIX}${ip}:lock`)
      }
      return { allowed: true }
    } catch (err) {
      this.logger.warn('Redis rate-limit check failed, allowing request', err)
      return { allowed: true }
    }
  }

  async recordFailure(ip: string): Promise<{ retryAfter?: number }> {
    try {
      const key = `${KEY_PREFIX}${ip}:count`
      const count = await this.redis.client.incr(key)
      await this.redis.client.expire(key, STALE_TTL)

      if (count >= MAX_ATTEMPTS_BEFORE_LOCK) {
        let lockSeconds = ESCALATION_THRESHOLDS[0].lockSeconds
        for (const t of ESCALATION_THRESHOLDS) {
          if (count >= t.attempts) lockSeconds = t.lockSeconds
        }
        const lockUntil = Date.now() + lockSeconds * 1000
        await this.redis.client.set(`${KEY_PREFIX}${ip}:lock`, String(lockUntil), 'EX', lockSeconds)
        return { retryAfter: lockSeconds }
      }
      return {}
    } catch (err) {
      this.logger.warn('Redis rate-limit record failed', err)
      return {}
    }
  }

  async resetOnSuccess(ip: string): Promise<void> {
    try {
      await this.redis.client.del(`${KEY_PREFIX}${ip}:count`, `${KEY_PREFIX}${ip}:lock`)
    } catch {
      /* best-effort */
    }
  }
}
