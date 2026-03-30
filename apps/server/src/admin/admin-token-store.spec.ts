import { AdminTokenStore } from './admin-token-store'

describe('AdminTokenStore', () => {
  let store: AdminTokenStore

  beforeEach(() => {
    jest.useFakeTimers()
    store = new AdminTokenStore()
  })

  afterEach(() => {
    store.onModuleDestroy()
    jest.useRealTimers()
  })

  describe('create', () => {
    it('returns a hex string token', () => {
      const token = store.create('127.0.0.1')
      expect(typeof token).toBe('string')
      expect(token).toMatch(/^[0-9a-f]{64}$/)
    })

    it('creates unique tokens each time', () => {
      const t1 = store.create('127.0.0.1')
      const t2 = store.create('127.0.0.1')
      expect(t1).not.toBe(t2)
    })
  })

  describe('validate', () => {
    it('returns true for a freshly created token', () => {
      const token = store.create('127.0.0.1')
      expect(store.validate(token)).toBe(true)
    })

    it('returns false for an unknown token', () => {
      expect(store.validate('nonexistent')).toBe(false)
    })

    it('returns false and cleans up an expired token (>1hr)', () => {
      const token = store.create('127.0.0.1')

      jest.advanceTimersByTime(60 * 60 * 1000 + 1)

      expect(store.validate(token)).toBe(false)
      // Second call also false (token was deleted)
      expect(store.validate(token)).toBe(false)
    })

    it('returns true for a token just under 1hr', () => {
      const token = store.create('127.0.0.1')

      jest.advanceTimersByTime(60 * 60 * 1000 - 1)

      expect(store.validate(token)).toBe(true)
    })
  })

  describe('revoke', () => {
    it('invalidates a token after revocation', () => {
      const token = store.create('127.0.0.1')
      expect(store.validate(token)).toBe(true)

      store.revoke(token)
      expect(store.validate(token)).toBe(false)
    })

    it('does not throw when revoking an unknown token', () => {
      expect(() => store.revoke('nonexistent')).not.toThrow()
    })
  })

  describe('cleanup', () => {
    it('removes expired tokens on cleanup interval', () => {
      const token = store.create('127.0.0.1')

      // Advance past TTL
      jest.advanceTimersByTime(60 * 60 * 1000 + 1)

      // Trigger cleanup interval (5 minutes)
      jest.advanceTimersByTime(5 * 60 * 1000)

      expect(store.validate(token)).toBe(false)
    })

    it('does not remove valid tokens during cleanup', () => {
      const token = store.create('127.0.0.1')

      // Trigger cleanup interval but token is still valid
      jest.advanceTimersByTime(5 * 60 * 1000)

      expect(store.validate(token)).toBe(true)
    })
  })
})
