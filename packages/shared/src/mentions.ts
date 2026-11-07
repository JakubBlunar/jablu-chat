export type MentionIdentity = {
  username: string
  displayName?: string | null
  globalDisplayName?: string | null
}

/** Account handles take precedence; a nickname must identify exactly one person. */
export function resolveMentionIdentity<T extends MentionIdentity>(name: string, members: Iterable<T>): T | undefined {
  const key = name.trim().toLowerCase()
  const rows = [...members]
  const account = rows.find((member) => member.username.toLowerCase() === key)
  if (account) return account
  const matches = rows.filter(
    (member) =>
      member.displayName?.trim().toLowerCase() === key || member.globalDisplayName?.trim().toLowerCase() === key
  )
  return matches.length === 1 ? matches[0] : undefined
}

/** Quoting lets multi-word, accented and punctuated nicknames remain readable. */
export function mentionText(name: string): string {
  return /^[\p{L}\p{N}_-]+$/u.test(name) ? `@${name}` : `@"${name}"`
}

export function replaceMemberMentions<T extends MentionIdentity>(content: string, members: Iterable<T>): string {
  const rows = [...members]
  return content.replace(
    /(?<![\p{L}\p{N}_@])@(?:"([^"\r\n]+)"|([\p{L}\p{N}_-]+))/gu,
    (full, quoted: string | undefined, word: string | undefined) => {
      const name = quoted ?? word ?? ''
      if (['everyone', 'here'].includes(name.toLowerCase())) return full
      const member = resolveMentionIdentity(name, rows)
      return member ? `@${member.username}` : full
    }
  )
}
