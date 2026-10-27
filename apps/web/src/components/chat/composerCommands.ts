const TEXT_COMMANDS: Record<string, (rest: string) => string> = {
  shrug: (rest) => `${rest} ¯\\_(ツ)_/¯`.trim(),
  tableflip: (rest) => `${rest} (╯°□°)╯︵ ┻━┻`.trim(),
  unflip: (rest) => `${rest} ┬─┬ ノ( ゜-゜ノ)`.trim(),
  lenny: (rest) => `${rest} ( ͡° ͜ʖ ͡°)`.trim(),
  spoiler: (rest) => (rest ? `||${rest}||` : ''),
  me: (rest) => (rest ? `*${rest}*` : '')
}
export function resolveTextCommand(cmd: string, rest: string): string | null {
  const handler = TEXT_COMMANDS[cmd]
  if (!handler) return null
  return handler(rest) || null
}
