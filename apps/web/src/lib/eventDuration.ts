/** Duration presets (in minutes) offered when scheduling an event. */
export const DURATION_PRESETS: { minutes: number; label: string }[] = [
  { minutes: 30, label: '30 minutes' },
  { minutes: 60, label: '1 hour' },
  { minutes: 90, label: '1 hour 30 minutes' },
  { minutes: 120, label: '2 hours' },
  { minutes: 180, label: '3 hours' },
  { minutes: 240, label: '4 hours' },
  { minutes: 1440, label: 'All day' }
]

/** Format a Date as a `datetime-local` input value in local wall time. */
export function toLocalDatetimeString(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${y}-${m}-${day}T${h}:${min}`
}

/** Convert an ISO instant to a local `datetime-local` input value. */
export function isoToLocalDatetimeString(iso: string): string {
  return toLocalDatetimeString(new Date(iso))
}

/** Convert a local `datetime-local` value to an ISO (UTC) instant, or null if empty/invalid. */
export function localToISO(local: string): string | null {
  if (!local) return null
  const d = new Date(local)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

/** Add `minutes` to a local `datetime-local` value and return the resulting ISO instant. */
export function addMinutesToLocalISO(startLocal: string, minutes: number): string | null {
  if (!startLocal) return null
  const d = new Date(startLocal)
  if (Number.isNaN(d.getTime())) return null
  d.setMinutes(d.getMinutes() + minutes)
  return d.toISOString()
}

/** Whole-minute difference between two ISO instants (end - start). */
export function diffMinutes(startISO: string, endISO: string): number {
  return Math.round((new Date(endISO).getTime() - new Date(startISO).getTime()) / 60000)
}
