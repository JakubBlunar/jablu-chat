import {
  Permission,
  ALL_PERMISSIONS,
  DEFAULT_EVERYONE_PERMISSIONS,
  DEFAULT_OWNER_PERMISSIONS,
  hasPermission,
  resolveChannelPermissions,
  permsToBigInt,
} from '@chat/shared'

describe('Permission constants', () => {
  it('should define each permission as a unique power of two', () => {
    const values = Object.values(Permission)
    const unique = new Set(values)
    expect(unique.size).toBe(values.length)
    for (const v of values) {
      expect(v > 0n).toBe(true)
      expect(v & (v - 1n)).toBe(0n) // power of two check
    }
  })

  it('ALL_PERMISSIONS should be the bitwise OR of every flag', () => {
    const manual = Object.values(Permission).reduce((a, b) => a | b, 0n)
    expect(ALL_PERMISSIONS).toBe(manual)
  })

  it('DEFAULT_EVERYONE_PERMISSIONS should equal SEND_MESSAGES', () => {
    expect(DEFAULT_EVERYONE_PERMISSIONS).toBe(Permission.SEND_MESSAGES)
  })

  it('DEFAULT_OWNER_PERMISSIONS should equal ALL_PERMISSIONS', () => {
    expect(DEFAULT_OWNER_PERMISSIONS).toBe(ALL_PERMISSIONS)
  })
})

describe('hasPermission', () => {
  it('returns true when the flag is present', () => {
    const perms = Permission.SEND_MESSAGES | Permission.KICK_MEMBERS
    expect(hasPermission(perms, Permission.SEND_MESSAGES)).toBe(true)
    expect(hasPermission(perms, Permission.KICK_MEMBERS)).toBe(true)
  })

  it('returns false when the flag is absent', () => {
    const perms = Permission.SEND_MESSAGES
    expect(hasPermission(perms, Permission.MANAGE_CHANNELS)).toBe(false)
  })

  it('ADMINISTRATOR bypasses all checks', () => {
    const perms = Permission.ADMINISTRATOR
    expect(hasPermission(perms, Permission.MANAGE_CHANNELS)).toBe(true)
    expect(hasPermission(perms, Permission.BAN_MEMBERS)).toBe(true)
    expect(hasPermission(perms, Permission.MANAGE_SERVER)).toBe(true)
    expect(hasPermission(perms, ALL_PERMISSIONS)).toBe(true)
  })

  it('returns true for zero flag on any permissions', () => {
    expect(hasPermission(0n, 0n)).toBe(true)
  })

  it('returns false for zero permissions with a non-zero flag', () => {
    expect(hasPermission(0n, Permission.SEND_MESSAGES)).toBe(false)
  })

  it('handles combined flag checks', () => {
    const perms = Permission.SEND_MESSAGES | Permission.MANAGE_MESSAGES
    const requiredBoth = Permission.SEND_MESSAGES | Permission.MANAGE_MESSAGES
    expect(hasPermission(perms, requiredBoth)).toBe(true)

    const missingOne = Permission.SEND_MESSAGES
    expect(hasPermission(missingOne, requiredBoth)).toBe(false)
  })
})

describe('resolveChannelPermissions', () => {
  it('returns role perms unchanged when no override', () => {
    const rolePerms = Permission.SEND_MESSAGES | Permission.MANAGE_CHANNELS
    expect(resolveChannelPermissions(rolePerms)).toBe(rolePerms)
    expect(resolveChannelPermissions(rolePerms, undefined)).toBe(rolePerms)
  })

  it('applies allow override to add permissions', () => {
    const rolePerms = Permission.SEND_MESSAGES
    const override = { allow: Permission.MANAGE_MESSAGES, deny: 0n }
    const result = resolveChannelPermissions(rolePerms, override)
    expect(hasPermission(result, Permission.SEND_MESSAGES)).toBe(true)
    expect(hasPermission(result, Permission.MANAGE_MESSAGES)).toBe(true)
  })

  it('applies deny override to remove permissions', () => {
    const rolePerms = Permission.SEND_MESSAGES | Permission.MANAGE_MESSAGES
    const override = { allow: 0n, deny: Permission.SEND_MESSAGES }
    const result = resolveChannelPermissions(rolePerms, override)
    expect(hasPermission(result, Permission.SEND_MESSAGES)).toBe(false)
    expect(hasPermission(result, Permission.MANAGE_MESSAGES)).toBe(true)
  })

  it('deny takes precedence over allow for the same bit', () => {
    const rolePerms = 0n
    const override = {
      allow: Permission.SEND_MESSAGES,
      deny: Permission.SEND_MESSAGES,
    }
    const result = resolveChannelPermissions(rolePerms, override)
    expect(hasPermission(result, Permission.SEND_MESSAGES)).toBe(false)
  })

  it('handles combined allow and deny on different flags', () => {
    const rolePerms = Permission.SEND_MESSAGES | Permission.KICK_MEMBERS
    const override = {
      allow: Permission.BAN_MEMBERS,
      deny: Permission.KICK_MEMBERS,
    }
    const result = resolveChannelPermissions(rolePerms, override)
    expect(hasPermission(result, Permission.SEND_MESSAGES)).toBe(true)
    expect(hasPermission(result, Permission.BAN_MEMBERS)).toBe(true)
    expect(hasPermission(result, Permission.KICK_MEMBERS)).toBe(false)
  })
})

describe('permsToBigInt', () => {
  it('returns bigint input as-is', () => {
    expect(permsToBigInt(42n)).toBe(42n)
  })

  it('converts a numeric string', () => {
    expect(permsToBigInt('64')).toBe(64n)
  })

  it('converts a number', () => {
    expect(permsToBigInt(64)).toBe(64n)
  })

  it('handles zero in all forms', () => {
    expect(permsToBigInt(0n)).toBe(0n)
    expect(permsToBigInt('0')).toBe(0n)
    expect(permsToBigInt(0)).toBe(0n)
  })

  it('handles large permission values', () => {
    const largeStr = ALL_PERMISSIONS.toString()
    expect(permsToBigInt(largeStr)).toBe(ALL_PERMISSIONS)
  })
})
