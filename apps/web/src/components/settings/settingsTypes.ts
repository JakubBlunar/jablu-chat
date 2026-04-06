import type { StatusDurationPreset, UserStatus } from '@chat/shared'

export type Tab =
  | 'account'
  | 'profile'
  | 'status'
  | 'appearance'
  | 'privacy'
  | 'voice'
  | 'notifications'
  | 'my-bots'
  | 'sessions'
  | 'shortcuts'
  | 'server'
  | 'desktop'
  | 'downloads'
  | 'install'

export const STATUS_OPTIONS: {
  value: UserStatus
  label: string
  color: string
  subtitle?: string
  /** Open duration submenu (Discord-style); Online is automatic. */
  pickDuration?: boolean
}[] = [
  { value: 'online', label: 'Online', color: 'bg-emerald-500' },
  { value: 'idle', label: 'Idle', color: 'bg-amber-400', pickDuration: true },
  {
    value: 'dnd',
    label: 'Do Not Disturb',
    color: 'bg-red-500',
    subtitle: 'You will not receive desktop notifications.',
    pickDuration: true
  },
  {
    value: 'offline',
    label: 'Invisible',
    color: 'bg-zinc-500',
    subtitle: 'You will appear offline to others.',
    pickDuration: true
  }
]

export const STATUS_DURATION_OPTIONS: { value: StatusDurationPreset; label: string }[] = [
  { value: '15m', label: 'For 15 minutes' },
  { value: '1h', label: 'For 1 hour' },
  { value: '8h', label: 'For 8 hours' },
  { value: '24h', label: 'For 24 hours' },
  { value: '3d', label: 'For 3 days' },
  { value: 'forever', label: 'Forever' }
]
