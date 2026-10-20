import type { StatusDurationPreset, UserStatus } from '@chat/shared'

export type Tab =
  | 'account'
  | 'profile'
  | 'status'
  | 'appearance'
  | 'privacy'
  | 'voice'
  | 'notifications'
  | 'activity-privacy'
  | 'activity-games'
  | 'my-bots'
  | 'sessions'
  | 'shortcuts'
  | 'desktop'
  | 'downloads'
  | 'install'

export const STATUS_OPTIONS: {
  value: UserStatus
  labelKey: string
  color: string
  subtitleKey?: string
  /** Open duration submenu (Discord-style); Online is automatic. */
  pickDuration?: boolean
}[] = [
  { value: 'online', labelKey: 'status.presence.online', color: 'bg-emerald-500' },
  { value: 'idle', labelKey: 'status.presence.idle', color: 'bg-amber-400', pickDuration: true },
  {
    value: 'dnd',
    labelKey: 'status.presence.dnd',
    color: 'bg-red-500',
    subtitleKey: 'status.subtitles.dnd',
    pickDuration: true
  },
  {
    value: 'offline',
    labelKey: 'status.presence.offline',
    color: 'bg-zinc-500',
    subtitleKey: 'status.subtitles.offline',
    pickDuration: true
  }
]

export const STATUS_DURATION_OPTIONS: { value: StatusDurationPreset; labelKey: string }[] = [
  { value: '15m', labelKey: 'status.duration.15m' },
  { value: '1h', labelKey: 'status.duration.1h' },
  { value: '8h', labelKey: 'status.duration.8h' },
  { value: '24h', labelKey: 'status.duration.24h' },
  { value: '3d', labelKey: 'status.duration.3d' },
  { value: 'forever', labelKey: 'status.duration.forever' }
]
