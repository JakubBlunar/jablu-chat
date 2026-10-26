import { useMemberStore } from '@/stores/member.store'
import type { Member } from '@/stores/member.store'
import { findMember } from './memberIndex'

export function serverDisplayName(
  user: { id: string; displayName?: string | null; username: string } | null | undefined,
  serverId: string | null | undefined,
  members: Member[]
): string | undefined {
  const member = findMember(members, serverId, user?.id)
  return member?.displayName ?? user?.displayName ?? user?.username
}

export function memberDisplayName(member: {
  displayName?: string | null
  user: { displayName?: string | null; username: string }
}): string {
  return member.displayName ?? member.user.displayName ?? member.user.username
}

export function useServerDisplayName(
  user: { id: string; displayName?: string | null; username: string } | null | undefined,
  serverId: string | null | undefined
): string | undefined {
  const name = useMemberStore((s) =>
    findMember(s.members, serverId, user?.id)?.displayName
  )
  return name ?? user?.displayName ?? user?.username
}
