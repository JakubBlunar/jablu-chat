import type { Member } from '@/stores/member.store'
import type { DmConversation } from '@/lib/api'
import { memberDisplayName } from '@/lib/serverProfile'
export type ResolvedReactor = {
  userId: string
  displayName: string
  username: string
  avatarUrl: string | null
  isUnknown: boolean
}
export function resolveReactorIdentity(
  userId: string,
  {
    self,
    members,
    dmMembers,
    mode,
    unknownLabel
  }: {
    self: { id: string; username: string; displayName?: string | null; avatarUrl?: string | null } | null
    members: Member[]
    dmMembers: DmConversation['members'] | undefined
    mode: 'channel' | 'dm'
    unknownLabel: string
  }
): ResolvedReactor {
  if (self && userId === self.id) {
    const member = mode === 'channel' ? members.find((m) => m.userId === userId) : undefined
    return {
      userId,
      displayName: member ? memberDisplayName(member) : (self.displayName ?? self.username),
      username: self.username,
      avatarUrl: self.avatarUrl ?? null,
      isUnknown: false
    }
  }
  if (mode === 'channel') {
    const m = members.find((mem) => mem.userId === userId)
    if (m) {
      return {
        userId,
        displayName: memberDisplayName(m),
        username: m.user.username,
        avatarUrl: m.user.avatarUrl ?? null,
        isUnknown: false
      }
    }
  } else {
    const dmMember = dmMembers?.find((mem) => mem.userId === userId)
    if (dmMember) {
      return {
        userId,
        displayName: dmMember.displayName ?? dmMember.username,
        username: dmMember.username,
        avatarUrl: dmMember.avatarUrl ?? null,
        isUnknown: false
      }
    }
  }
  return {
    userId,
    displayName: unknownLabel,
    username: userId.slice(0, 8),
    avatarUrl: null,
    isUnknown: true
  }
}
