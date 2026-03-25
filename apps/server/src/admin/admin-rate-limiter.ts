import { Injectable, OnModuleDestroy } from '@nestjs/common'

interface AttemptRecord {
  count: number
  lastAttempt: number
  lockedUntil: number
}

const MAX_ATTEMPTS_BEFORE_LOCK = 5
const ESCALATION_THRESHOLDS = [
  { attempts: 5, lockSeconds: 15 * 60 },
  { attempts: 10, lockSeconds: 60 * 60 },
  { attempts: 20, lockSeconds: 6 * 60 * 60 }
]
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000
const STALE_AFTER_MS = 6 * 60 * 60 * 1000

@Injectable()
export class AdminRateLimiter implements OnModuleDestroy {
  private readonly attempts = new Map<string, AttemptRecord>()
  private readonly cleanupTimer: ReturnType<typeof setInterval>

  constructor() {
    this.cleanupTimer = setInterval(() => this.cleanup(), CLEANUP_INTERVAL_MS)
  }

  onModuleDestroy() {
    clearInterval(this.cleanupTimer)
  }

  check(ip: string): { allowed: boolean; retryAfter?: number } {
    const record = this.attempts.get(ip)
    if (!record) return { allowed: true }

    const now = Date.now()
    if (record.lockedUntil > now) {
      return {
        allowed: false,
        retryAfter: Math.ceil((record.lockedUntil - now) / 1000)
      }
    }

    return { allowed: true }
  }

  recordFailure(ip: string): { retryAfter?: number } {
    const now = Date.now()
    const record = this.attempts.get(ip) ?? {
      count: 0,
      lastAttempt: now,
      lockedUntil: 0
    }

    record.count++
    record.lastAttempt = now

    if (record.count >= MAX_ATTEMPTS_BEFORE_LOCK) {
      let lockSeconds = ESCALATION_THRESHOLDS[0].lockSeconds
      for (const t of ESCALATION_THRESHOLDS) {
        if (record.count >= t.attempts) lockSeconds = t.lockSeconds
      }
      record.lockedUntil = now + lockSeconds * 1000
      this.attempts.set(ip, record)
      return { retryAfter: lockSeconds }
    }

    this.attempts.set(ip, record)
    return {}
  }

  resetOnSuccess(ip: string): void {
    this.attempts.delete(ip)
  }

  private cleanup(): void {
    const now = Date.now()
    for (const [ip, record] of this.attempts) {
      if (now - record.lastAttempt > STALE_AFTER_MS && record.lockedUntil < now) {
        this.attempts.delete(ip)
      }
    }
  }
}
