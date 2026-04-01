import { hashUsernameToHue, usernameAccentStyle } from './username-color'

describe('hashUsernameToHue', () => {
  it('returns a number in [0, 360)', () => {
    for (const name of ['alice', 'bob', 'x', 'LongUsername123!']) {
      const hue = hashUsernameToHue(name)
      expect(hue).toBeGreaterThanOrEqual(0)
      expect(hue).toBeLessThan(360)
    }
  })

  it('is deterministic', () => {
    expect(hashUsernameToHue('alice')).toBe(hashUsernameToHue('alice'))
  })

  it('produces different hues for different names', () => {
    expect(hashUsernameToHue('alice')).not.toBe(hashUsernameToHue('bob'))
  })

  it('returns 0 for empty string', () => {
    expect(hashUsernameToHue('')).toBe(0)
  })
})

describe('usernameAccentStyle', () => {
  it('returns an HSL color string', () => {
    const { color } = usernameAccentStyle('alice')
    expect(color).toMatch(/^hsl\(\d+ 65% 68%\)$/)
  })

  it('uses the hue from hashUsernameToHue', () => {
    const hue = hashUsernameToHue('testuser')
    expect(usernameAccentStyle('testuser').color).toBe(`hsl(${hue} 65% 68%)`)
  })
})
