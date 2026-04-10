import type { PrismaService } from '../prisma/prisma.service'

export type WebPushPrefs = {
  pushSuppressAll: boolean
  pushQuietHoursEnabled: boolean
  pushQuietHoursTz: string | null
  pushQuietHoursStartMin: number
  pushQuietHoursEndMin: number
}

/** Current local time as minutes from midnight [0, 1439] in `timeZone`, or null if invalid. */
export function minutesInTimeZone(date: Date, timeZone: string): number | null {
  const tz = timeZone.trim()
  if (!tz) return null
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).formatToParts(date)
    const hour = parseInt(parts.find((p) => p.type === 'hour')?.value ?? 'NaN', 10)
    const minute = parseInt(parts.find((p) => p.type === 'minute')?.value ?? 'NaN', 10)
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null
    return hour * 60 + minute
  } catch {
    return null
  }
}

/** Whether `localMinutes` falls in [start, end), supporting overnight windows (start > end). */
export function isInQuietHoursWindow(localMinutes: number, startMin: number, endMin: number): boolean {
  if (startMin === endMin) return false
  if (startMin < endMin) return localMinutes >= startMin && localMinutes < endMin
  return localMinutes >= startMin || localMinutes < endMin
}

export function shouldDeliverWebPush(prefs: WebPushPrefs, now: Date = new Date()): boolean {
  if (prefs.pushSuppressAll) return false
  if (!prefs.pushQuietHoursEnabled) return true
  const tz = prefs.pushQuietHoursTz?.trim()
  if (!tz) return true
  const m = minutesInTimeZone(now, tz)
  if (m === null) return true
  return !isInQuietHoursWindow(m, prefs.pushQuietHoursStartMin, prefs.pushQuietHoursEndMin)
}

export async function filterUserIdsForWebPush(
  prisma: Pick<PrismaService, 'user'>,
  userIds: string[],
  now: Date = new Date()
): Promise<string[]> {
  if (userIds.length === 0) return []
  const unique = [...new Set(userIds)]
  const rows = await prisma.user.findMany({
    where: { id: { in: unique } },
    select: {
      id: true,
      pushSuppressAll: true,
      pushQuietHoursEnabled: true,
      pushQuietHoursTz: true,
      pushQuietHoursStartMin: true,
      pushQuietHoursEndMin: true
    }
  })
  const allowed = new Set(rows.filter((r) => shouldDeliverWebPush(r, now)).map((r) => r.id))
  return unique.filter((id) => allowed.has(id))
}

export function assertValidIanaTimeZone(tz: string): void {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz.trim() })
  } catch {
    throw new Error('INVALID_TIMEZONE')
  }
}
