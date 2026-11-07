export function hashUsernameToHue(username: string): number {
  let hash = 0
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash)
  }
  return Math.abs(hash) % 360
}

export function usernameAccentStyle(username: string): { color: string } {
  const h = hashUsernameToHue(username)
  return { color: `hsl(${h} 65% var(--username-lightness, 68%))` }
}

export function roleColorStyle(color: string): { color: string } {
  return { color: `color-mix(in srgb, ${color} var(--role-color-share, 100%), #101828)` }
}
