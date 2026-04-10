import { isElectron } from '@/lib/electron'
import type { Message } from '@chat/shared'

export function buildMessageJumpPath(
  kind: 'channel',
  ids: { serverId: string; channelId: string; messageId: string }
): string
export function buildMessageJumpPath(
  kind: 'dm',
  ids: { conversationId: string; messageId: string }
): string
export function buildMessageJumpPath(
  kind: 'channel' | 'dm',
  ids:
    | { serverId: string; channelId: string; messageId: string }
    | { conversationId: string; messageId: string }
): string {
  if (kind === 'channel') {
    const { serverId, channelId, messageId } = ids as {
      serverId: string
      channelId: string
      messageId: string
    }
    return `/channels/${serverId}/${channelId}?m=${encodeURIComponent(messageId)}`
  }
  const { conversationId, messageId } = ids as { conversationId: string; messageId: string }
  return `/channels/@me/${conversationId}?m=${encodeURIComponent(messageId)}`
}

/** Absolute URL that opens the app at the given in-app path (hash-aware for Electron). */
export function getMessageShareUrl(appPath: string): string {
  const path = appPath.startsWith('/') ? appPath : `/${appPath}`
  if (isElectron) {
    const base = window.location.href.replace(/#.*$/, '')
    return `${base}#${path}`
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
