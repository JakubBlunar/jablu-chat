import type { DmConversation } from '@/lib/api/types'

/**
 * Human-readable name for a DM conversation: the group name (or joined member
 * names) for group DMs, otherwise the other participant's display name.
 */
export function getDmDisplayName(
  conv: Pick<DmConversation, 'isGroup' | 'groupName' | 'members'>,
  currentUserId: string | undefined
): string {
  if (conv.isGroup) {
    if (conv.groupName) return conv.groupName
    const others = conv.members.filter((m) => m.userId !== currentUserId)
    if (others.length === 0) return 'Group'
    return others.map((m) => m.displayName ?? m.username).join(', ')
  }
  const other = conv.members.find((m) => m.userId !== currentUserId)
  return other?.displayName ?? other?.username ?? 'Unknown'
}
