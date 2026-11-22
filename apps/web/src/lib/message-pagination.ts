import type { Message } from '@chat/shared'

export const MAX_MESSAGES = 250

/** Preserve the order of the first occurrence. Message IDs survive retries and reconnects. */
export function uniqueMessages(messages: Message[]): Message[] {
  const ids = new Set<string>()
  const unique = messages.filter(message => {
    if (ids.has(message.id)) return false
    ids.add(message.id)
    return true
  })
  return unique.length === messages.length ? messages : unique
}

export function mergeOlderPage(current: Message[], page: Message[]) {
  const resident = new Set(current.map(message => message.id))
  return uniqueMessages([...page.filter(message => !resident.has(message.id)), ...current])
}

export function mergeNewerPage(current: Message[], page: Message[], atRequest: Set<string>, hasNewer: boolean) {
  const existing = new Map(current.map(message => [message.id, message]))
  return uniqueMessages([
    ...current.filter(message => atRequest.has(message.id)),
    ...page.map(message => existing.get(message.id) ?? message),
    // When more pages follow, retain a contiguous window so the next cursor cannot skip a gap.
    ...(hasNewer ? [] : current.filter(message => !atRequest.has(message.id)))
  ])
}

export function toChronological(messagesDesc: Message[]): Message[] {
  return uniqueMessages(messagesDesc.slice().reverse())
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
