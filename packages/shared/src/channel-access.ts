import {
  DEFAULT_OWNER_PERMISSIONS,
  Permission,
  hasPermission,
  permsToBigInt,
  resolveMultiRoleChannelPermissions,
  resolveMultiRolePermissions,
  type Role
} from './types/permissions.js'

export type ChannelAccessRule = { roleId: string; allow: string; deny: string }
export type ChannelAccessMember = {
  userId: string
  username: string
  displayName: string | null
  avatarUrl: string | null
  roleIds: string[]
}
export type ChannelAccessContext = {
  ownerId: string
  roles: Role[]
  overrides: ChannelAccessRule[]
  members: ChannelAccessMember[]
}
export type ChannelAccessSave = {
  overrides: ChannelAccessRule[]
  expectedOverrides: ChannelAccessRule[]
}
export type ChannelPermissionState = 'inherit' | 'allow' | 'deny'
export type ChannelAccessStatus = 'hidden' | 'readOnly' | 'readWrite'

/** Use raw bits here: hasPermission deliberately treats ADMINISTRATOR as every flag. */
export function getChannelRuleState(rule: ChannelAccessRule | undefined, flag: bigint): ChannelPermissionState {
  if (rule && (permsToBigInt(rule.allow) & flag) !== 0n) return 'allow'
  if (rule && (permsToBigInt(rule.deny) & flag) !== 0n) return 'deny'
  return 'inherit'
}

/** Changing one control must preserve all other permission bits, including hidden voice/send bits. */
export function setChannelRuleState(
  rule: ChannelAccessRule,
  flag: bigint,
  state: ChannelPermissionState
): ChannelAccessRule {
  let allow = permsToBigInt(rule.allow) & ~flag
  let deny = permsToBigInt(rule.deny) & ~flag
  if (state === 'allow') allow |= flag
  if (state === 'deny') deny |= flag
  return { roleId: rule.roleId, allow: allow.toString(), deny: deny.toString() }
}

export function canonicalChannelRules(rules: ChannelAccessRule[]): string {
  return JSON.stringify(
    rules
      .map(({ roleId, allow, deny }) => ({
        roleId,
        allow: BigInt(allow).toString(),
        deny: BigInt(deny).toString()
      }))
      .sort((a, b) => a.roleId.localeCompare(b.roleId))
  )
}

export function explainChannelAccess(
  context: Pick<ChannelAccessContext, 'ownerId' | 'roles'>,
  member: ChannelAccessMember,
  rules: ChannelAccessRule[]
) {
  const roleIds = new Set(member.roleIds)
  for (const role of context.roles) if (role.isDefault) roleIds.add(role.id)
  const roles = context.roles.filter((role) => roleIds.has(role.id))
  const base = resolveMultiRolePermissions(roles.map((role) => ({ permissions: permsToBigInt(role.permissions) })))
  const bypass =
    member.userId === context.ownerId ? 'owner' : hasPermission(base, Permission.ADMINISTRATOR) ? 'administrator' : null
  const applicable = rules.filter((rule) => roleIds.has(rule.roleId))
  const permissions = bypass
    ? DEFAULT_OWNER_PERMISSIONS
    : resolveMultiRoleChannelPermissions(
        base,
        applicable.map((rule) => ({ allow: permsToBigInt(rule.allow), deny: permsToBigInt(rule.deny) }))
      )
  const source = (flag: bigint) => ({
    baseAllowed: hasPermission(base, flag),
    allowedBy: roles.filter((role) =>
      applicable.some((rule) => rule.roleId === role.id && (BigInt(rule.allow) & flag) !== 0n)
    ),
    deniedBy: roles.filter((role) =>
      applicable.some((rule) => rule.roleId === role.id && (BigInt(rule.deny) & flag) !== 0n)
    )
  })
  const canView = hasPermission(permissions, Permission.VIEW_CHANNEL)
  const canSend = canView && hasPermission(permissions, Permission.SEND_MESSAGES)
  const status: ChannelAccessStatus = !canView ? 'hidden' : canSend ? 'readWrite' : 'readOnly'
  return {
    roles,
    bypass: bypass ?? (hasPermission(permissions, Permission.ADMINISTRATOR) ? ('administrator' as const) : null),
    permissions,
    canView,
    canSend,
    status,
    view: source(Permission.VIEW_CHANNEL),
    send: source(Permission.SEND_MESSAGES)
  }
}
