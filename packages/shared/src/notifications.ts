export function messageNotificationUrl(path: string, messageId: string, threadParentId?: string | null): string {
  const query = `m=${encodeURIComponent(messageId)}${threadParentId ? `&thread=${encodeURIComponent(threadParentId)}` : ''}`
  return `${path}?${query}`
}

/** Message jumps share a conversation's toast tag so reading clears every transport. */
export function notificationTag(url?: string): string | undefined {
  if (!url) return undefined
  const [path, query] = url.split('?')
  const remaining = (query ?? '').split('&').filter((part) =>
    part && part !== 'm' && part !== 'thread' && !part.startsWith('m=') && !part.startsWith('thread=')
  ).join('&')
  return `jablu-${path}${remaining ? `?${remaining}` : ''}`
}
