import type { UserStatus } from '@chat/shared'

export type Tab =
  | 'account'
  | 'profile'
  | 'status'
  | 'privacy'
  | 'voice'
  | 'notifications'
  | 'sessions'
  | 'shortcuts'
  | 'server'
  | 'desktop'
  | 'downloads'
  | 'install'

export const STATUS_OPTIONS: { value: UserStatus; label: string; color: string }[] = [
  { value: 'online', label: 'Online', color: 'bg-emerald-500' },
  { value: 'idle', label: 'Idle', color: 'bg-amber-400' },
  { value: 'dnd', label: 'Do Not Disturb', color: 'bg-red-500' },
  { value: 'offline', label: 'Invisible', color: 'bg-zinc-500' }
]
