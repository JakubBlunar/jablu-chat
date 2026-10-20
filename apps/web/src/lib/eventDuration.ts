/** Duration presets offered when scheduling an event. */
export const DURATION_PRESETS: { minutes: number; labelKey: string }[] = [
  { minutes: 30, labelKey: 'scheduleFields.presets.30Minutes' },
  { minutes: 60, labelKey: 'scheduleFields.presets.1Hour' },
  { minutes: 90, labelKey: 'scheduleFields.presets.1Hour30Minutes' },
  { minutes: 120, labelKey: 'scheduleFields.presets.2Hours' },
  { minutes: 180, labelKey: 'scheduleFields.presets.3Hours' },
  { minutes: 240, labelKey: 'scheduleFields.presets.4Hours' },
  { minutes: 1440, labelKey: 'scheduleFields.presets.allDay' }
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
