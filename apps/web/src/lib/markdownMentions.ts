import type { Member } from '@/stores/member.store'

export type RoleMentionRef = { id: string; name: string; color: string | null }

export function processMentions(
  text: string,
  byUsername: Map<string, Member>,
  rolesByLowerName?: Map<string, RoleMentionRef>
): string {
  let out = text
  out = out.replace(/@"([^"]+)"/g, (full, inner: string) => {
    const key = inner.trim().toLowerCase()
    const memberByDisplay = [...byUsername.values()].find(
      (m) => m.user.displayName?.trim().toLowerCase() === key
    )
    if (memberByDisplay) {
      const display = memberByDisplay.user.displayName ?? memberByDisplay.user.username
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
      const display = member.user.displayName ?? member.user.username
      return `[@${display}](mention:${member.user.username})`
    }
    const role = rolesByLowerName?.get(lower)
    if (role) return `[@${role.name}](mention:role:${role.id})`
    return full
  })
}
