function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function timeOnly(d: Date): string {
  return d.toLocaleTimeString(getAppIntlLocale(), {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })
}

export function formatTimeOnly(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return timeOnly(d)
}

export function formatSmartTimestamp(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''

  const now = new Date()
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)

  if (isSameDay(d, now)) return timeOnly(d)

  if (isSameDay(d, yesterday)) return `${relativeDay('yesterday')} ${timeOnly(d)}`

  const sameYear = d.getFullYear() === now.getFullYear()
  const datePart = d.toLocaleDateString(getAppIntlLocale(), {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' })
  })
  return `${datePart}, ${timeOnly(d)}`
}

export function formatDateSeparator(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''

  const now = new Date()
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)

  if (isSameDay(d, now)) return relativeDay('today')
  if (isSameDay(d, yesterday)) return relativeDay('yesterday')

  return d.toLocaleDateString(getAppIntlLocale(), {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {})
  })
}

export function formatFullDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString(getAppIntlLocale(), {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })
}

export function isDifferentDay(a: string, b: string): boolean {
  const da = new Date(a)
  const db = new Date(b)
  if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return false
  return !isSameDay(da, db)
}
import i18n from 'i18next'

export function getAppIntlLocale(): string {
  const language = (i18n.resolvedLanguage ?? i18n.language ?? 'en').split('-')[0]
  return language === 'cs' ? 'cs-CZ' : language === 'sk' ? 'sk-SK' : 'en-US'
}

function relativeDay(key: 'today' | 'yesterday'): string {
  return i18n.isInitialized ? i18n.t(key, { ns: 'common' }) : key === 'today' ? 'Today' : 'Yesterday'
}
