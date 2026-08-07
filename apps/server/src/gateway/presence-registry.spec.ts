import { PresenceRegistry, normalizePlatform, normalizeVisibility } from './presence-registry'

const AWAY_MS = 5 * 60 * 1000

describe('normalizeVisibility', () => {
  it('only accepts the literal "visible"', () => {
    expect(normalizeVisibility('visible')).toBe('visible')
    expect(normalizeVisibility('hidden')).toBe('hidden')
    expect(normalizeVisibility(undefined)).toBe('hidden')
    expect(normalizeVisibility('VISIBLE')).toBe('hidden')
  })
})

describe('normalizePlatform', () => {
  it('falls back to "unknown" for unrecognised values', () => {
    expect(normalizePlatform('desktop')).toBe('desktop')
    expect(normalizePlatform('mobile')).toBe('mobile')
    expect(normalizePlatform('toaster')).toBe('unknown')
    expect(normalizePlatform(undefined)).toBe('unknown')
  })
})

describe('PresenceRegistry', () => {
  let registry: PresenceRegistry

  beforeEach(() => {
    registry = new PresenceRegistry()
  })

  it('indexes sessions by user and removes them on disconnect', () => {
    registry.add({ socketId: 's1', userId: 'u1' })
    registry.add({ socketId: 's2', userId: 'u1' })
    registry.add({ socketId: 's3', userId: 'u2' })

    expect(registry.sessionsForUser('u1')).toHaveLength(2)

    registry.remove('s1')
    expect(registry.sessionsForUser('u1')).toHaveLength(1)

    registry.remove('s2')
    expect(registry.sessionsForUser('u1')).toEqual([])
    expect(registry.sessionsForUser('u2')).toHaveLength(1)
  })

  it('removing an unknown socket is a no-op', () => {
    registry.add({ socketId: 's1', userId: 'u1' })
    registry.remove('nope')
    expect(registry.sessionsForUser('u1')).toHaveLength(1)
  })

  describe('isActivelyEngaged', () => {
    it('defaults a session to hidden so unreported clients still get push', () => {
      registry.add({ socketId: 's1', userId: 'u1' })
      expect(registry.isActivelyEngaged('u1', AWAY_MS)).toBe(false)
    })

    it('is true for a visible session with recent input', () => {
      const now = 1_000_000
      registry.add({ socketId: 's1', userId: 'u1', visibility: 'visible', now })
      expect(registry.isActivelyEngaged('u1', AWAY_MS, now + 1000)).toBe(true)
    })

    it('does not require OS focus — the app on a second monitor counts', () => {
      const now = 1_000_000
      registry.add({ socketId: 's1', userId: 'u1', visibility: 'visible', focused: false, now })
      expect(registry.isActivelyEngaged('u1', AWAY_MS, now)).toBe(true)
    })

    it('is false once input goes stale, even while still visible', () => {
      const now = 1_000_000
      registry.add({ socketId: 's1', userId: 'u1', visibility: 'visible', now })
      expect(registry.isActivelyEngaged('u1', AWAY_MS, now + AWAY_MS + 1)).toBe(false)
    })

    it('is false for a hidden session no matter how recent the input', () => {
      const now = 1_000_000
      registry.add({ socketId: 's1', userId: 'u1', visibility: 'hidden', now })
      registry.touch('s1', now)
      expect(registry.isActivelyEngaged('u1', AWAY_MS, now)).toBe(false)
    })

    it('is true when any one of several sessions qualifies', () => {
      const now = 1_000_000
      registry.add({ socketId: 'tray', userId: 'u1', visibility: 'hidden', now })
      registry.add({ socketId: 'phone', userId: 'u1', visibility: 'visible', now })
      expect(registry.isActivelyEngaged('u1', AWAY_MS, now)).toBe(true)
    })

    it('is false for a user with no sessions at all', () => {
      expect(registry.isActivelyEngaged('ghost', AWAY_MS)).toBe(false)
    })
  })

  describe('setState', () => {
    it('flips visibility and refreshes the away timer', () => {
      const now = 1_000_000
      registry.add({ socketId: 's1', userId: 'u1', visibility: 'hidden', now })
      registry.setState('s1', { visibility: 'visible', focused: true }, now + AWAY_MS * 2)

      const session = registry.get('s1')!
      expect(session.visibility).toBe('visible')
      expect(session.focused).toBe(true)
      expect(registry.isActivelyEngaged('u1', AWAY_MS, now + AWAY_MS * 2)).toBe(true)
    })

    it('leaves unspecified fields untouched', () => {
      registry.add({ socketId: 's1', userId: 'u1', visibility: 'visible', focused: true })
      registry.setState('s1', { focused: false })
      expect(registry.get('s1')!.visibility).toBe('visible')
      expect(registry.get('s1')!.focused).toBe(false)
    })

    it('returns undefined for an unknown socket', () => {
      expect(registry.setState('nope', { visibility: 'visible' })).toBeUndefined()
    })
  })

  describe('touch', () => {
    it('keeps a visible session engaged across the away threshold', () => {
      const now = 1_000_000
      registry.add({ socketId: 's1', userId: 'u1', visibility: 'visible', now })
      registry.touch('s1', now + AWAY_MS - 1)
      expect(registry.isActivelyEngaged('u1', AWAY_MS, now + AWAY_MS + 10)).toBe(true)
    })
  })

  describe('engagedDeviceIds', () => {
    it('lists only device ids of visible, recently active sessions', () => {
      const now = 1_000_000
      registry.add({ socketId: 's1', userId: 'u1', deviceId: 'desk', visibility: 'visible', now })
      registry.add({ socketId: 's2', userId: 'u1', deviceId: 'phone', visibility: 'hidden', now })
      registry.add({ socketId: 's3', userId: 'u1', deviceId: null, visibility: 'visible', now })

      expect(registry.engagedDeviceIds('u1', AWAY_MS, now)).toEqual(new Set(['desk']))
    })
  })
})
