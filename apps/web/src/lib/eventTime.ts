import type { EventStatus } from '@chat/shared'
import type { TFunction } from 'i18next'
import { getAppIntlLocale } from './format-time'

type EventTranslator = TFunction<'events'>

/** Local-time "HH:MM" for an instant. */
function timeOf(d: Date): string {
  return d.toLocaleTimeString(getAppIntlLocale(), { hour: '2-digit', minute: '2-digit', hour12: false })
}

/** Whole calendar-day difference (local time) between two dates: b - a in days. */
function calendarDayDiff(a: Date, b: Date): number {
  const da = new Date(a.getFullYear(), a.getMonth(), a.getDate())
  const db = new Date(b.getFullYear(), b.getMonth(), b.getDate())
  return Math.round((db.getTime() - da.getTime()) / (1000 * 60 * 60 * 24))
}

/** A relative day label like "Today", "Tomorrow", "Yesterday", or "Mon, Jul 22". */
function dayLabel(d: Date, now: Date, t?: EventTranslator): string {
  const days = calendarDayDiff(now, d)
  if (days === 0) return t ? t('schedule.today') : 'Today'
  if (days === 1) return t ? t('schedule.tomorrow') : 'Tomorrow'
  if (days === -1) return t ? t('schedule.yesterday') : 'Yesterday'
  return d.toLocaleDateString(getAppIntlLocale(), { weekday: 'short', month: 'short', day: 'numeric' })
}

/** Human-readable relative time for a server event's start, e.g. "Today at 18:00". */
export function formatEventTime(iso: string, t?: EventTranslator): string {
  const d = new Date(iso)
  const now = new Date()
  const time = timeOf(d)
  const days = calendarDayDiff(now, d)
  const date = days < 0
    ? d.toLocaleDateString(getAppIntlLocale(), { month: 'short', day: 'numeric' })
    : dayLabel(d, now, t)
  return t ? t('schedule.atTime', { date, time }) : `${date} at ${time}`
}

/** Format a duration in milliseconds as "1h 30m", "2h", or "45m". */
export function formatDuration(ms: number, t?: EventTranslator): string {
  const totalMinutes = Math.max(0, Math.round(ms / 60000))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours > 0 && minutes > 0) {
    return t ? t('duration.hoursMinutes', { hours, minutes }) : `${hours}h ${minutes}m`
  }
  if (hours > 0) return t ? t('duration.hours', { hours }) : `${hours}h`
  return t ? t('duration.minutes', { minutes }) : `${minutes}m`
}

/**
 * Status- and calendar-day-aware schedule label for an event.
 * - active:    "Ends at HH:MM" (or "LIVE" when no end is known)
 * - upcoming:  "Today at HH:MM (2h)" (duration only when endAt is present)
 * - past:      "Ended {date}" / "Ended {date} at HH:MM"
 */
export function formatEventSchedule(
  startIso: string,
  endIso?: string | null,
  status?: EventStatus,
  t?: EventTranslator
): string {
  const now = new Date()
  const start = new Date(startIso)
  const end = endIso ? new Date(endIso) : null

  if (status === 'active') {
    if (end) {
      const time = timeOf(end)
      return t ? t('schedule.endsAt', { time }) : `Ends at ${time}`
    }
    return t ? t('schedule.live') : 'LIVE'
  }

  if (status === 'completed' || status === 'cancelled' || start.getTime() < now.getTime()) {
    const ref = end ?? start
    const date = dayLabel(ref, now, t)
    const time = timeOf(ref)
    return t ? t('schedule.endedAt', { date, time }) : `Ended ${date} at ${time}`
  }

  const base = formatEventTime(startIso, t)
  if (end) {
    const duration = formatDuration(end.getTime() - start.getTime(), t)
    return t ? t('schedule.withDuration', { dateTime: base, duration }) : `${base} (${duration})`
  }
  return base
}
