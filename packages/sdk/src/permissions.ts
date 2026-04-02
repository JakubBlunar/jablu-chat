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

export function hasPermission(permissions: bigint, flag: bigint): boolean {
  if (permissions & Permission.ADMINISTRATOR) return true
  return (permissions & flag) === flag
}
