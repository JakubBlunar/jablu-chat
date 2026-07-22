import { formatDuration, formatEventSchedule, formatEventTime } from './eventTime'

function isoIn(msFromNow: number): string {
  return new Date(Date.now() + msFromNow).toISOString()
}

const HOUR = 60 * 60 * 1000

describe('formatDuration', () => {
  it('formats hours and minutes', () => {
    expect(formatDuration(90 * 60 * 1000)).toBe('1h 30m')
  })

  it('formats whole hours', () => {
    expect(formatDuration(2 * HOUR)).toBe('2h')
  })

  it('formats minutes only', () => {
    expect(formatDuration(45 * 60 * 1000)).toBe('45m')
  })

  it('never goes negative', () => {
    expect(formatDuration(-1000)).toBe('0m')
  })
})

describe('formatEventTime', () => {
  it('labels today', () => {
    // 2 hours from now stays on the same calendar day for most of the day.
    const label = formatEventTime(isoIn(2 * HOUR))
    // Could roll to Tomorrow if run within 2h of midnight; accept either.
    expect(/^(Today|Tomorrow) at \d{2}:\d{2}$/.test(label)).toBe(true)
  })
})

describe('formatEventSchedule', () => {
  it('shows end time for active events with an end', () => {
    const end = isoIn(HOUR)
    const label = formatEventSchedule(isoIn(-HOUR), end, 'active')
    expect(label).toMatch(/^Ends at \d{2}:\d{2}$/)
  })

  it('shows LIVE for active events without an end', () => {
    expect(formatEventSchedule(isoIn(-HOUR), null, 'active')).toBe('LIVE')
  })

  it('appends duration for upcoming events with an end', () => {
    const start = isoIn(3 * HOUR)
    const end = isoIn(5 * HOUR)
    expect(formatEventSchedule(start, end, 'scheduled')).toContain('(2h)')
  })

  it('marks past events as ended', () => {
    const label = formatEventSchedule(isoIn(-5 * HOUR), isoIn(-3 * HOUR), 'completed')
    expect(label.startsWith('Ended')).toBe(true)
  })

  it('treats a past start with no status as ended', () => {
    const label = formatEventSchedule(isoIn(-5 * HOUR))
    expect(label.startsWith('Ended')).toBe(true)
  })
})
