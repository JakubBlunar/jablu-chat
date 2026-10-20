import type { User, UserStatus } from '@chat/shared'
import type { TFunction } from 'i18next'

type SettingsTranslate = TFunction<'settings'>

export function statusDisplayLabel(status: UserStatus, t: SettingsTranslate): string {
  return t(`status.presence.${status}`)
}

/** e.g. "11:53 AM" in the selected locale */
export function formatManualStatusUntilTime(iso: string, locale?: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat(locale, { timeStyle: 'short' }).format(d)
}

/**
 * Secondary line when user has a manual presence with optional expiry (Discord-style "Until …").
 */
export function manualPresenceSubtitle(
  user: Pick<User, 'manualStatus' | 'manualStatusExpiresAt'>,
  t: SettingsTranslate,
  locale?: string
): string | null {
  if (!user.manualStatus) return null
  if (user.manualStatusExpiresAt) {
    const time = formatManualStatusUntilTime(user.manualStatusExpiresAt, locale)
    return time ? t('status.untilTime', { time }) : null
  }
  return t('status.untilChange')
}

/** Effective label for footer (manual mode shows idle/dnd/invisible even when API status mirrors it). */
export function footerPresenceLabel(user: Pick<User, 'manualStatus' | 'status'>, t: SettingsTranslate): string {
  const key = (user.manualStatus ?? user.status) as UserStatus
  return statusDisplayLabel(key, t)
}
