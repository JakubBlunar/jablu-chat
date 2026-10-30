/** A destination is data; feature components do not own loading or selection. */
export type ConversationTarget =
  | { kind: 'channel'; serverId: string; channelId: string }
  | { kind: 'dm'; conversationId: string }
  | { kind: 'server'; serverId: string }
  | { kind: 'home' }

export type ConversationPosition =
  | { kind: 'unread' }
  | { kind: 'latest'; threadParentId?: string }
  | { kind: 'message'; messageId: string; threadParentId?: string | null }
  | { kind: 'thread'; parentId: string }

export interface ConversationRequest {
  target: ConversationTarget
  position?: ConversationPosition
  source?: 'sidebar' | 'inbox' | 'notification' | 'search' | 'saved' | 'reply' | 'unread' | 'route' | 'command' | 'link'
  /** Non-position query parameters retained when consuming a deep link. */
  search?: string
}

export type ConversationOutcome =
  | { status: 'opened'; path: string; target: ConversationTarget; empty: boolean }
  | { status: 'cancelled' }
  | { status: 'unavailable'; key: 'messageUnavailable' }
  | { status: 'error'; key: 'historyLoadFailed' }

export function conversationPath(request: ConversationRequest, includePosition = true): string {
  const target = request.target
  const path =
    target.kind === 'home'
      ? '/channels/@me'
      : target.kind === 'dm'
        ? `/channels/@me/${encodeURIComponent(target.conversationId)}`
        : target.kind === 'server'
          ? `/channels/${encodeURIComponent(target.serverId)}`
          : `/channels/${encodeURIComponent(target.serverId)}/${encodeURIComponent(target.channelId)}`
  const query = new URLSearchParams(request.search)
  query.delete('m')
  query.delete('thread')
  if (includePosition && request.position?.kind === 'message') {
    query.set('m', request.position.messageId)
    if (request.position.threadParentId) query.set('thread', request.position.threadParentId)
  } else if (includePosition && request.position?.kind === 'thread') {
    query.set('m', request.position.parentId)
    query.set('thread', request.position.parentId)
  }
  return `${path}${query.size ? `?${query}` : ''}`
}

export function parseConversationPath(value: string): ConversationRequest | null {
  try {
    const url = new URL(value, window.location.origin)
    if (url.origin !== window.location.origin) return null
    const route = new URL(url.hash.startsWith('#/') ? url.hash.slice(1) : `${url.pathname}${url.search}`, url.origin)
    const parts = route.pathname.split('/').filter(Boolean).map(decodeURIComponent)
    if (parts[0] !== 'channels' || parts.length < 2 || parts.length > 3) return null
    const target: ConversationTarget =
      parts[1] === '@me'
        ? parts[2]
          ? { kind: 'dm', conversationId: parts[2] }
          : { kind: 'home' }
        : parts[2]
          ? { kind: 'channel', serverId: parts[1], channelId: parts[2] }
          : { kind: 'server', serverId: parts[1] }
    const query = new URLSearchParams(route.search)
    const messageId = query.get('m')
    const parent = query.get('thread')
    query.delete('m')
    query.delete('thread')
    const position: ConversationPosition = messageId
      ? parent === messageId
        ? { kind: 'thread', parentId: parent }
        : { kind: 'message', messageId, threadParentId: parent }
      : { kind: 'unread' }
    return { target, position, search: query.toString(), source: 'route' }
  } catch {
    return null
  }
}
