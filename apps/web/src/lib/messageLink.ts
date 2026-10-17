import { isElectron } from '@/lib/electron'
import { getServerBaseUrl } from '@/lib/serverUrl'
import type { Message } from '@chat/shared'

export function buildMessageJumpPath(
  kind: 'channel',
  ids: { serverId: string; channelId: string; messageId: string; threadParentId?: string | null }
): string
export function buildMessageJumpPath(
  kind: 'dm',
  ids: { conversationId: string; messageId: string; threadParentId?: string | null }
): string
export function buildMessageJumpPath(
  kind: 'channel' | 'dm',
  ids:
    | { serverId: string; channelId: string; messageId: string; threadParentId?: string | null }
    | { conversationId: string; messageId: string; threadParentId?: string | null }
): string {
  const query = `m=${encodeURIComponent(ids.messageId)}${ids.threadParentId ? `&thread=${encodeURIComponent(ids.threadParentId)}` : ''}`
  if (kind === 'channel' && 'serverId' in ids) {
    return `/channels/${ids.serverId}/${ids.channelId}?${query}`
  }
  if ('conversationId' in ids) return `/channels/@me/${ids.conversationId}?${query}`
  throw new Error('Missing message link context')
}

/** Absolute URL that opens the app at the given in-app path. On desktop this points
 * at the configured server's web origin so the link is shareable with others. */
export function getMessageShareUrl(appPath: string): string {
  const path = appPath.startsWith('/') ? appPath : `/${appPath}`
  if (isElectron) {
    const serverUrl = getServerBaseUrl()
    if (serverUrl) return `${serverUrl.replace(/\/+$/, '')}${path}`
    return `${window.location.origin}${path}`
  }
  return `${window.location.origin}${path}`
}

export function buildForwardQuoteBlock(message: Message, channelLabel: string, jumpUrl: string): string {
  const author = message.author?.displayName ?? message.author?.username ?? 'Unknown'
  const raw = (message.content ?? '').trim()
  const snippet =
    raw.length > 900 ? `${raw.slice(0, 900)}…` : raw || (message.attachments?.length ? '[attachment]' : '')
  const quoted = snippet.replace(/\r\n/g, '\n').split('\n').join('\n> ')
  return `> **${author}** in ${channelLabel}:\n> ${quoted}\n\n${jumpUrl}`
}
