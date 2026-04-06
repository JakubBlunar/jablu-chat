import type { User, UserStatus } from '@chat/shared'

const STATUS_LABELS: Record<UserStatus, string> = {
  online: 'Online',
  idle: 'Idle',
  dnd: 'Do Not Disturb',
  offline: 'Invisible'
}

export function statusDisplayLabel(status: UserStatus): string {
  return STATUS_LABELS[status]
}

/** e.g. "11:53 AM" in local locale */
export function formatManualStatusUntilTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat(undefined, { timeStyle: 'short' }).format(d)
}

/**
 * Secondary line when user has a manual presence with optional expiry (Discord-style "Until …").
 */
export function manualPresenceSubtitle(
  user: Pick<User, 'manualStatus' | 'manualStatusExpiresAt'>
): string | null {
  if (!user.manualStatus) return null
  if (user.manualStatusExpiresAt) {
    const t = formatManualStatusUntilTime(user.manualStatusExpiresAt)
    return t ? `Until ${t}` : null
  }
  return 'Until you change it'
}

/** Effective label for footer (manual mode shows idle/dnd/invisible even when API status mirrors it). */
export function footerPresenceLabel(user: Pick<User, 'manualStatus' | 'status'>): string {
  const key = (user.manualStatus ?? user.status) as UserStatus
  return statusDisplayLabel(key)
}
