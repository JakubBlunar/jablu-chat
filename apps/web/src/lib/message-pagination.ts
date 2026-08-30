import type { Message } from '@chat/shared'

export const MAX_MESSAGES = 250

export function toChronological(messagesDesc: Message[]): Message[] {
  return messagesDesc.slice().reverse()
}

export function trimOldest(msgs: Message[]): Message[] {
  return msgs.length > MAX_MESSAGES ? msgs.slice(msgs.length - MAX_MESSAGES) : msgs
}

export function trimNewest(msgs: Message[]): Message[] {
  return msgs.length > MAX_MESSAGES ? msgs.slice(0, MAX_MESSAGES) : msgs
}

/**
 * Fold a freshly fetched newest page over what is on screen.
 *
 * The fresh page is authoritative for the range it covers, so a message edited
 * or deleted while the app was closed is corrected by taking the page
 * wholesale. The exception is anything that arrived over the socket while the
 * request was in flight, identified by not having been present when the
 * request was issued — deciding that by timestamp instead would keep a deleted
 * message alive whenever its clock ran fast.
 */
export function mergeNewestPage(
  current: Message[],
  fresh: Message[],
  idsWhenRequested: ReadonlySet<string>
): Message[] {
  if (!fresh.length) return current

  const freshIds = new Set(fresh.map((m) => m.id))
  const arrivedDuringFetch = current.filter((m) => !freshIds.has(m.id) && !idsWhenRequested.has(m.id))

  return [...fresh, ...arrivedDuringFetch]
}
