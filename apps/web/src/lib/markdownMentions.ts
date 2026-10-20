export type MemberMentionRef = { user: { username: string; displayName: string | null; globalDisplayName?: string | null } }
export type RoleMentionRef = { id: string; name: string; color: string | null }

export function processMentions(
  text: string,
  byUsername: Map<string, MemberMentionRef>,
  rolesByLowerName?: Map<string, RoleMentionRef>
): string {
  let out = text
  out = out.replace(/@"([^"]+)"/g, (full, inner: string) => {
    const key = inner.trim().toLowerCase()
    const memberByDisplay = [...byUsername.values()].find(
      (m) => m.user.displayName?.trim().toLowerCase() === key || m.user.globalDisplayName?.trim().toLowerCase() === key
    )
    if (memberByDisplay) {
      const display = (memberByDisplay.user.displayName ?? memberByDisplay.user.username).replace(/[\\[\]]/g, '\\$&')
      return `[@${display}](mention:${memberByDisplay.user.username})`
    }
    const role = rolesByLowerName?.get(key)
    if (role) return `[@${role.name}](mention:role:${role.id})`
    return full
  })
  // Avoid matching @user inside already-built markdown links like [@Name](mention:...)
  return out.replace(/(?<!\[)@(\w+)/g, (full, name: string) => {
    const lower = name.toLowerCase()
    if (lower === 'everyone') return `[@everyone](mention:everyone)`
    if (lower === 'here') return `[@here](mention:here)`
    const member = byUsername.get(lower)
    if (member) {
      const display = (member.user.displayName ?? member.user.username).replace(/[\\[\]]/g, '\\$&')
      return `[@${display}](mention:${member.user.username})`
    }
    const role = rolesByLowerName?.get(lower)
    if (role) return `[@${role.name}](mention:role:${role.id})`
    return full
  })
}
