export type ComposerTrigger = { mode: 'mention' | 'channel' | 'command' | 'emoji'; query: string; start: number }

export function findComposerTrigger(
  value: string,
  cursor: number,
  enabled: {
    mentions: boolean
    channels: boolean
    commands: boolean
    emojis: boolean
  }
): ComposerTrigger | null {
  const text = value.slice(0, cursor)
  const best = Math.max(text.lastIndexOf('@'), text.lastIndexOf('#'), text.lastIndexOf('/'))
  if (enabled.emojis) {
    const colon = text.lastIndexOf(':')
    const query = text.slice(colon + 1)
    if (colon !== -1 && colon >= best && query.length >= 1 && !/[\s:]/.test(query)) {
      return { mode: 'emoji', query, start: colon }
    }
  }
  if (best === -1 || (best > 0 && /\S/.test(text[best - 1]))) return null
  const query = text.slice(best + 1)
  if (/\n/.test(query)) return null
  const trigger = text[best]
  const mode =
    trigger === '@' && enabled.mentions
      ? 'mention'
      : trigger === '#' && enabled.channels
        ? 'channel'
        : trigger === '/' && enabled.commands
          ? 'command'
          : null
  return mode ? { mode, query, start: best } : null
}

export function applyComposerCompletion(value: string, start: number, cursor: number, inserted: string) {
  return { value: value.slice(0, start) + inserted + value.slice(cursor), cursor: start + inserted.length }
}
