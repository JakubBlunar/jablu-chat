import { AdminRateLimiter } from './admin-rate-limiter'

describe('AdminRateLimiter', () => {
  let limiter: AdminRateLimiter

  beforeEach(() => {
    jest.useFakeTimers()
    limiter = new AdminRateLimiter()
  })

  afterEach(() => {
    limiter.onModuleDestroy()
    jest.useRealTimers()
  })

  describe('check', () => {
    it('allows when no record exists', () => {
      expect(limiter.check('1.2.3.4')).toEqual({ allowed: true })
    })

    it('allows when record exists but not locked', () => {
      limiter.recordFailure('1.2.3.4') // 1 failure, below threshold
      expect(limiter.check('1.2.3.4')).toEqual({ allowed: true })
    })

    it('blocks when locked with retryAfter', () => {
      for (let i = 0; i < 5; i++) limiter.recordFailure('1.2.3.4')

      const result = limiter.check('1.2.3.4')
      expect(result.allowed).toBe(false)
      expect(result.retryAfter).toBeGreaterThan(0)
      expect(result.retryAfter).toBeLessThanOrEqual(900) // 15 min
    })

    it('allows after lock expires', () => {
      for (let i = 0; i < 5; i++) limiter.recordFailure('1.2.3.4')
      expect(limiter.check('1.2.3.4').allowed).toBe(false)

      jest.advanceTimersByTime(15 * 60 * 1000 + 1)
      expect(limiter.check('1.2.3.4').allowed).toBe(true)
    })
  })

  describe('recordFailure', () => {
    it('returns empty below threshold (< 5 attempts)', () => {
      for (let i = 0; i < 4; i++) {
        expect(limiter.recordFailure('1.2.3.4')).toEqual({})
      }
    })

    it('locks for 15 minutes at 5 attempts', () => {
      for (let i = 0; i < 4; i++) limiter.recordFailure('1.2.3.4')
      const result = limiter.recordFailure('1.2.3.4') // 5th
      expect(result.retryAfter).toBe(900) // 15 * 60
    })

    it('escalates to 1 hour at 10 attempts', () => {
      for (let i = 0; i < 9; i++) limiter.recordFailure('1.2.3.4')
      const result = limiter.recordFailure('1.2.3.4') // 10th
      expect(result.retryAfter).toBe(3600) // 60 * 60
    })

    it('escalates to 6 hours at 20 attempts', () => {
      for (let i = 0; i < 19; i++) limiter.recordFailure('1.2.3.4')
      const result = limiter.recordFailure('1.2.3.4') // 20th
      expect(result.retryAfter).toBe(21600) // 6 * 60 * 60
    })

    it('tracks IPs independently', () => {
      for (let i = 0; i < 5; i++) limiter.recordFailure('1.1.1.1')
      expect(limiter.check('1.1.1.1').allowed).toBe(false)
      expect(limiter.check('2.2.2.2').allowed).toBe(true)
    })
  })

  describe('resetOnSuccess', () => {
    it('clears the record for an IP', () => {
      for (let i = 0; i < 5; i++) limiter.recordFailure('1.2.3.4')
      expect(limiter.check('1.2.3.4').allowed).toBe(false)

      limiter.resetOnSuccess('1.2.3.4')
      expect(limiter.check('1.2.3.4')).toEqual({ allowed: true })
    })

    it('does not throw for unknown IP', () => {
      expect(() => limiter.resetOnSuccess('unknown')).not.toThrow()
    })
  })
})
