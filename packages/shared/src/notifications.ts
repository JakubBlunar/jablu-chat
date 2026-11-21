import { z } from 'zod'

export function messageNotificationUrl(path: string, messageId: string, threadParentId?: string | null): string {
  const query = `m=${encodeURIComponent(messageId)}${threadParentId ? `&thread=${encodeURIComponent(threadParentId)}` : ''}`
  return `${path}?${query}`
}

/** Keep deep links exact while grouping alerts for the same chat or thread. */
export function notificationTag(url?: string): string | undefined {
  if (!url) return undefined
  const [path, query] = url.split('?')
  const remaining = (query ?? '').split('&').filter((part) =>
    part && part !== 'm' && !part.startsWith('m=')
  ).join('&')
  return `jablu-${path}${remaining ? `?${remaining}` : ''}`
}

export type ReadBoundary = { throughMessageId: string; threadParentId?: string; seenOnly?: boolean }

export type NotificationDismissal = {
  urls: string[] | null
  throughAt?: string
  includeThreads?: boolean
}

export type NotificationTarget = {
  mode: 'channel' | 'dm'
  contextId: string
  serverId: string | null
  threadParentId: string | null
  messageId: string
}

export function notificationMessageTarget(url?: string): NotificationTarget | null {
  if (!url) return null
  const [path, query] = url.split('?')
  const match = /^\/channels\/([\w@-]+)\/([\w-]+)$/.exec(path)
  const parts = query?.split('&') ?? []
  const readParam = (name: string) => {
    const value = parts.find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1)
    if (!value) return null
    try { return decodeURIComponent(value) } catch { return null }
  }
  const messageId = readParam('m')
  if (!match || !messageId) return null
  const dm = match[1] === '@me'
  return {
    mode: dm ? 'dm' : 'channel',
    contextId: match[2],
    serverId: dm ? null : match[1],
    threadParentId: dm ? null : readParam('thread'),
    messageId
  }
}

const reactionActivityVersionSchema = z.object({
  id: z.uuid(),
  updatedAt: z.iso.datetime({ precision: 3 })
})

export const REACTIONS_SEEN_BATCH_SIZE = 100
export const reactionsSeenSchema = z.object({
  reactions: z.array(reactionActivityVersionSchema).min(1).max(REACTIONS_SEEN_BATCH_SIZE)
})

export type ReactionActivityVersion = z.infer<typeof reactionActivityVersionSchema>

export type ReactionActivity = ReactionActivityVersion & {
  messageId: string
  emoji: string
  isCustom: boolean
}
