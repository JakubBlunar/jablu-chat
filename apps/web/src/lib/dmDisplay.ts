import type { DmConversation } from '@/lib/api'

export function getDmDisplayInfo(conversation: DmConversation, userId?: string) {
  if (conversation.isGroup) {
    const name =
      conversation.groupName || conversation.members.map((member) => member.displayName ?? member.username).join(', ')
    return { name, avatarUrl: null }
  }
  const other = conversation.members.find((member) => member.userId !== userId)
  return {
    name: other?.displayName ?? other?.username ?? 'Unknown',
    avatarUrl: other?.avatarUrl ?? null
  }
}
