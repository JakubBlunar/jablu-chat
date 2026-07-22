import type { EventStatus } from '@chat/shared'

/** Local-time "HH:MM" for an instant. */
function timeOf(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
}

/** Whole calendar-day difference (local time) between two dates: b - a in days. */
function calendarDayDiff(a: Date, b: Date): number {
  const da = new Date(a.getFullYear(), a.getMonth(), a.getDate())
  const db = new Date(b.getFullYear(), b.getMonth(), b.getDate())
  return Math.round((db.getTime() - da.getTime()) / (1000 * 60 * 60 * 24))
}

/** A relative day label like "Today", "Tomorrow", "Yesterday", or "Mon, Jul 22". */
function dayLabel(d: Date, now: Date): string {
  const days = calendarDayDiff(now, d)
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  if (days === -1) return 'Yesterday'
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

/** Human-readable relative time for a server event's start, e.g. "Today at 18:00". */
export function formatEventTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const time = timeOf(d)
  const days = calendarDayDiff(now, d)

  if (days < 0) {
    return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at ${time}`
  }
  return `${dayLabel(d, now)} at ${time}`
}

/** Format a duration in milliseconds as "1h 30m", "2h", or "45m". */
export function formatDuration(ms: number): string {
  const totalMinutes = Math.max(0, Math.round(ms / 60000))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`
  if (hours > 0) return `${hours}h`
  return `${minutes}m`
}

/**
 * Status- and calendar-day-aware schedule label for an event.
 * - active:    "Ends at HH:MM" (or "LIVE" when no end is known)
 * - upcoming:  "Today at HH:MM (2h)" (duration only when endAt is present)
 * - past:      "Ended {date}" / "Ended {date} at HH:MM"
 */
export function formatEventSchedule(startIso: string, endIso?: string | null, status?: EventStatus): string {
  const now = new Date()
  const start = new Date(startIso)
  const end = endIso ? new Date(endIso) : null

  if (status === 'active') {
    if (end) return `Ends at ${timeOf(end)}`
    return 'LIVE'
  }

  if (status === 'completed' || status === 'cancelled' || start.getTime() < now.getTime()) {
    const ref = end ?? start
    return `Ended ${dayLabel(ref, now)} at ${timeOf(ref)}`
  }

  const base = formatEventTime(startIso)
  if (end) return `${base} (${formatDuration(end.getTime() - start.getTime())})`
  return base
}
