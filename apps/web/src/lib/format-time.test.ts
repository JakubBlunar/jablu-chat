import { formatTimeOnly, formatSmartTimestamp, formatDateSeparator, formatFullDateTime, isDifferentDay } from './format-time'

function isoAt(year: number, month: number, day: number, h = 12, m = 0): string {
  return new Date(year, month - 1, day, h, m).toISOString()
}

describe('formatTimeOnly', () => {
  it('returns HH:MM for a valid ISO string', () => {
    const result = formatTimeOnly(isoAt(2025, 6, 15, 14, 30))
    expect(result).toBe('14:30')
  })

  it('returns empty string for invalid input', () => {
    expect(formatTimeOnly('not-a-date')).toBe('')
  })
})

describe('formatSmartTimestamp', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date(2025, 5, 15, 10, 0))
  })
  afterEach(() => jest.useRealTimers())

  it('shows time only for today', () => {
    expect(formatSmartTimestamp(isoAt(2025, 6, 15, 8, 45))).toBe('08:45')
  })

  it('prefixes "Yesterday" for yesterday', () => {
    const result = formatSmartTimestamp(isoAt(2025, 6, 14, 9, 0))
    expect(result).toMatch(/^Yesterday 09:00$/)
  })

  it('shows month/day for older same-year dates', () => {
    const result = formatSmartTimestamp(isoAt(2025, 1, 10, 15, 0))
    expect(result).toMatch(/Jan 10/)
    expect(result).not.toMatch(/2025/)
  })

  it('includes year for different-year dates', () => {
    const result = formatSmartTimestamp(isoAt(2023, 3, 5, 12, 0))
    expect(result).toMatch(/2023/)
  })

  it('returns empty string for invalid input', () => {
    expect(formatSmartTimestamp('garbage')).toBe('')
  })
})

describe('formatDateSeparator', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date(2025, 5, 15, 10, 0))
  })
  afterEach(() => jest.useRealTimers())

  it('returns "Today" for today', () => {
    expect(formatDateSeparator(isoAt(2025, 6, 15, 3, 0))).toBe('Today')
  })

  it('returns "Yesterday" for yesterday', () => {
    expect(formatDateSeparator(isoAt(2025, 6, 14, 22, 0))).toBe('Yesterday')
  })

  it('returns full weekday + month + day for older same-year dates', () => {
    const result = formatDateSeparator(isoAt(2025, 3, 10))
    expect(result).toMatch(/Monday, March 10/)
    expect(result).not.toMatch(/2025/)
  })

  it('includes year for different-year dates', () => {
    const result = formatDateSeparator(isoAt(2023, 7, 20))
    expect(result).toMatch(/2023/)
  })

  it('returns empty string for invalid input', () => {
    expect(formatDateSeparator('nope')).toBe('')
  })
})

describe('formatFullDateTime', () => {
  it('formats a complete date-time string', () => {
    const result = formatFullDateTime(isoAt(2025, 6, 15, 14, 30))
    expect(result).toMatch(/Jun 15, 2025/)
    expect(result).toMatch(/14:30/)
  })

  it('returns empty string for invalid input', () => {
    expect(formatFullDateTime('bad')).toBe('')
  })
})

describe('isDifferentDay', () => {
  it('returns true for different days', () => {
    expect(isDifferentDay(isoAt(2025, 6, 15), isoAt(2025, 6, 16))).toBe(true)
  })

  it('returns false for same day different times', () => {
    expect(isDifferentDay(isoAt(2025, 6, 15, 1, 0), isoAt(2025, 6, 15, 23, 59))).toBe(false)
  })

  it('returns false when either date is invalid', () => {
    expect(isDifferentDay('bad', isoAt(2025, 6, 15))).toBe(false)
    expect(isDifferentDay(isoAt(2025, 6, 15), 'bad')).toBe(false)
  })
})
