export const Permission = {
  MANAGE_CHANNELS:  1n << 0n,
  MANAGE_MESSAGES:  1n << 1n,
  KICK_MEMBERS:     1n << 2n,
  BAN_MEMBERS:      1n << 3n,
  MANAGE_ROLES:     1n << 4n,
  MANAGE_SERVER:    1n << 5n,
  SEND_MESSAGES:    1n << 6n,
  MENTION_EVERYONE: 1n << 7n,
  MANAGE_EMOJIS:    1n << 8n,
  MANAGE_EVENTS:    1n << 9n,
  MANAGE_WEBHOOKS:  1n << 10n,
  ADMINISTRATOR:    1n << 11n,
  VIEW_CHANNEL:     1n << 12n,
  MUTE_MEMBERS:     1n << 13n,
} as const

export type PermissionFlag = (typeof Permission)[keyof typeof Permission]

export const ALL_PERMISSIONS = Object.values(Permission).reduce((a, b) => a | b, 0n)

export const DEFAULT_EVERYONE_PERMISSIONS =
  Permission.SEND_MESSAGES | Permission.VIEW_CHANNEL

export const DEFAULT_OWNER_PERMISSIONS = ALL_PERMISSIONS

export function hasPermission(permissions: bigint, flag: bigint): boolean {
  if (permissions & Permission.ADMINISTRATOR) return true
  return (permissions & flag) === flag
}

export function resolveChannelPermissions(
  rolePerms: bigint,
  override?: { allow: bigint; deny: bigint }
): bigint {
  if (!override) return rolePerms
  return (rolePerms | override.allow) & ~override.deny
}

export const PERMISSION_LABELS: Record<string, string> = {
  MANAGE_CHANNELS:  'Manage Channels',
  MANAGE_MESSAGES:  'Manage Messages',
  KICK_MEMBERS:     'Kick Members',
  BAN_MEMBERS:      'Ban Members',
  MANAGE_ROLES:     'Manage Roles',
  MANAGE_SERVER:    'Manage Server',
  SEND_MESSAGES:    'Send Messages',
  MENTION_EVERYONE: 'Mention @everyone',
  MANAGE_EMOJIS:    'Manage Emojis',
  MANAGE_EVENTS:    'Manage Events',
  MANAGE_WEBHOOKS:  'Manage Webhooks',
  ADMINISTRATOR:    'Administrator',
  VIEW_CHANNEL:     'View Channel',
  MUTE_MEMBERS:     'Timeout Members',
}

export interface Role {
  id: string
  serverId: string
  name: string
  color: string | null
  position: number
  permissions: string
  isDefault: boolean
  createdAt: string
}

export interface ChannelPermissionOverride {
  id: string
  channelId: string
  roleId: string
  allow: string
  deny: string
}

export function permsToBigInt(perms: string | bigint | number): bigint {
  if (typeof perms === 'bigint') return perms
  return BigInt(perms)
}
