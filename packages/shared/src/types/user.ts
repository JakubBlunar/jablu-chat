export type DmPrivacy = 'everyone' | 'friends_only'

/** How long a manual status (idle / dnd / invisible) stays before reverting to automatic. */
export type StatusDurationPreset = '15m' | '1h' | '8h' | '24h' | '3d' | 'forever'

export interface User {
  id: string
  username: string
  displayName: string | null
  email: string
  avatarUrl: string | null
  bio: string | null
  status: UserStatus
  /** Set when user picked idle / dnd / invisible; null means automatic (follow activity while online). */
  manualStatus: UserStatus | null
  /** ISO datetime when manual status ends; null with manualStatus set means no auto-expiry. */
  manualStatusExpiresAt: string | null
  customStatus: string | null
  dmPrivacy: DmPrivacy
  lastSeenAt: string | null
  createdAt: string
}

export type UserStatus = 'online' | 'idle' | 'dnd' | 'offline'

export interface UserProfile extends User {
  memberSince?: string
  role?: ServerRole
  roleColor?: string | null
}

/** @deprecated Use Role from permissions.ts instead */
export type ServerRole = 'owner' | 'admin' | 'member'
