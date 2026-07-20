/** Categories of activity that can be detected and shared. */
export type ActivityKind = 'game' | 'music'

/** Where a detected activity came from (desktop detection only). */
export type ActivitySource = 'steam' | 'process' | 'smtc' | 'manual'

/** Who a user's activity is shared with by default when joining a new server. */
export type ActivityDefaultSharing = 'friends_all' | 'friends_small' | 'friends_only'

/**
 * A raw activity detected by the desktop shell (Rust) and passed to the
 * renderer over the Tauri event bridge. Icons may arrive inline as base64
 * data URLs (process/SMTC) or as remote URLs (Steam CDN).
 */
export interface DetectedActivity {
  source: ActivitySource
  kind: ActivityKind
  /** Game title or music app name (e.g. "Spotify"). */
  name: string
  /** Steam appid or a stable key for a detected process. */
  appId?: string | null
  /** Executable file name for non-Steam processes (used for icon caching). */
  executable?: string | null
  /** Secondary line, e.g. track title for music. */
  details?: string | null
  /** Tertiary line, e.g. artist for music. */
  state?: string | null
  /** Inline base64 icon (process exe icon / album art). */
  iconDataUrl?: string | null
  /** Remote icon URL (e.g. Steam CDN). */
  iconUrl?: string | null
  /** Epoch ms when the activity was first detected. */
  startedAt: number
}

/**
 * A user's shareable activity as broadcast to friends/servers and stored in
 * memory on the gateway. Icons are always URLs here (never inline bytes).
 */
export interface UserActivity {
  kind: ActivityKind
  name: string
  details?: string | null
  state?: string | null
  iconUrl?: string | null
  /** ISO datetime when the activity started. */
  startedAt: string
}

/** A game the user has played / registered (Discord-style "Added Games"). */
export interface RegisteredGame {
  id: string
  name: string
  source: ActivitySource
  executable: string | null
  steamAppId: string | null
  iconUrl: string | null
  /** Detected automatically (has an executable/appid we can match) vs. manual. */
  verified: boolean
  /** When true, this game is never shared as activity. */
  hidden: boolean
  lastPlayedAt: string | null
  createdAt: string
}

/** User-level activity sharing preferences (server-persisted). */
export interface ActivitySettings {
  /** Master toggle: share game/music activity with others. Off by default. */
  shareEnabled: boolean
  /** Notify friends when I come online. Off by default. */
  shareOnline: boolean
  /** Default recipient scope when joining a new server. */
  defaultSharing: ActivityDefaultSharing
  /** Sub-filter: share game activity. */
  shareGames: boolean
  /** Sub-filter: share music activity. */
  shareMusic: boolean
}

/** Payload for the `user:activity` gateway event. */
export interface UserActivityPayload {
  userId: string
  activity: UserActivity | null
}

/** An entry in the curated non-Steam detectables list. */
export interface GameDetectable {
  name: string
  /** Lowercased executable file names that identify this game. */
  executables: string[]
  iconUrl?: string | null
}
