import {
  filterUserIdsForWebPush,
  isInQuietHoursWindow,
  minutesInTimeZone,
  shouldDeliverWebPush
} from './push-user-allow'

describe('minutesInTimeZone', () => {
  it('returns consistent local minutes for UTC', () => {
    const d = new Date('2024-06-15T15:30:00.000Z')
    expect(minutesInTimeZone(d, 'UTC')).toBe(15 * 60 + 30)
  })

  it('returns null for empty timezone', () => {
    expect(minutesInTimeZone(new Date(), '')).toBeNull()
    expect(minutesInTimeZone(new Date(), '   ')).toBeNull()
  })

})

describe('isInQuietHoursWindow', () => {
  it('same start and end means not in window', () => {
    expect(isInQuietHoursWindow(720, 600, 600)).toBe(false)
  })

  it('same-day window', () => {
    expect(isInQuietHoursWindow(9 * 60 + 0, 8 * 60, 22 * 60)).toBe(true)
    expect(isInQuietHoursWindow(7 * 60, 8 * 60, 22 * 60)).toBe(false)
    expect(isInQuietHoursWindow(22 * 60, 8 * 60, 22 * 60)).toBe(false)
  })

  it('overnight window 22:00–08:00', () => {
    expect(isInQuietHoursWindow(23 * 60, 22 * 60, 8 * 60)).toBe(true)
    expect(isInQuietHoursWindow(3 * 60, 22 * 60, 8 * 60)).toBe(true)
    expect(isInQuietHoursWindow(12 * 60, 22 * 60, 8 * 60)).toBe(false)
  })
})

describe('shouldDeliverWebPush', () => {
  const base = {
    pushSuppressAll: false,
    pushQuietHoursEnabled: false,
    pushQuietHoursTz: 'UTC',
    pushQuietHoursStartMin: 22 * 60,
    pushQuietHoursEndMin: 8 * 60
  }

  it('blocks when suppress all', () => {
    expect(shouldDeliverWebPush({ ...base, pushSuppressAll: true }, new Date('2024-06-15T12:00:00Z'))).toBe(false)
  })

  it('allows when quiet hours disabled', () => {
    expect(shouldDeliverWebPush(base, new Date('2024-06-15T23:00:00Z'))).toBe(true)
  })

  it('blocks inside quiet hours in UTC (overnight window)', () => {
    const prefs = { ...base, pushQuietHoursEnabled: true, pushQuietHoursTz: 'UTC' }
    expect(shouldDeliverWebPush(prefs, new Date('2024-06-15T23:00:00Z'))).toBe(false)
    expect(shouldDeliverWebPush(prefs, new Date('2024-06-15T03:00:00Z'))).toBe(false)
    expect(shouldDeliverWebPush(prefs, new Date('2024-06-15T12:00:00Z'))).toBe(true)
  })

  it('allows when quiet hours enabled but no timezone (fail open)', () => {
    const prefs = {
      ...base,
      pushQuietHoursEnabled: true,
      pushQuietHoursTz: null
    }
    expect(shouldDeliverWebPush(prefs, new Date('2024-06-15T23:00:00Z'))).toBe(true)
  })
})

describe('filterUserIdsForWebPush', () => {
  it('filters suppressed users', async () => {
    const prisma = {
      user: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'a',
            pushSuppressAll: true,
            pushQuietHoursEnabled: false,
            pushQuietHoursTz: null,
            pushQuietHoursStartMin: 0,
            pushQuietHoursEndMin: 0
          },
          {
            id: 'b',
            pushSuppressAll: false,
            pushQuietHoursEnabled: false,
            pushQuietHoursTz: null,
            pushQuietHoursStartMin: 0,
            pushQuietHoursEndMin: 0
          }
        ])
      }
    }
    const out = await filterUserIdsForWebPush(prisma as any, ['a', 'b'])
    expect(out).toEqual(['b'])
  })
})
