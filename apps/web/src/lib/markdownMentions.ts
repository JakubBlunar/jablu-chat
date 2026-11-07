import { resolveMentionIdentity } from '@chat/shared'
export type MemberMentionRef = {
  user: { username: string; displayName: string | null; globalDisplayName?: string | null }
}
export type RoleMentionRef = { id: string; name: string; color: string | null }

export function processMentions(
  text: string,
  byUsername: Map<string, MemberMentionRef>,
  rolesByLowerName?: Map<string, RoleMentionRef>
): string {
  let out = text
  out = out.replace(/@"([^"]+)"/g, (full, inner: string) => {
    const key = inner.trim().toLowerCase()
    const identity = resolveMentionIdentity(
      key,
      [...byUsername.values()].map((member) => member.user)
    )
    const memberByDisplay = identity ? byUsername.get(identity.username.toLowerCase()) : undefined
    if (memberByDisplay) {
      const display = (memberByDisplay.user.displayName ?? memberByDisplay.user.username).replace(/[\\[\]]/g, '\\$&')
      return `[@${display}](mention:${memberByDisplay.user.username})`
    }
    const role = rolesByLowerName?.get(key)
    if (role) return `[@${role.name}](mention:role:${role.id})`
    return full
  })
  // Avoid matching @user inside already-built markdown links like [@Name](mention:...)
  return out.replace(/(?<!\[)(?<![\p{L}\p{N}_@])@([\p{L}\p{N}_-]+)/gu, (full, name: string) => {
    const lower = name.toLowerCase()
    if (lower === 'everyone') return `[@everyone](mention:everyone)`
    if (lower === 'here') return `[@here](mention:here)`
    const identity = resolveMentionIdentity(
      lower,
      [...byUsername.values()].map((member) => member.user)
    )
    const member = identity ? byUsername.get(identity.username.toLowerCase()) : undefined
    if (member) {
      const display = (member.user.displayName ?? member.user.username).replace(/[\\[\]]/g, '\\$&')
      return `[@${display}](mention:${member.user.username})`
    }
    const role = rolesByLowerName?.get(lower)
    if (role) return `[@${role.name}](mention:role:${role.id})`
    return full
  })
}
