import { useMemberStore } from '@/stores/member.store'
import type { Member } from '@/stores/member.store'

export function serverDisplayName(
  user: { id: string; displayName?: string | null; username: string } | null | undefined,
  serverId: string | null | undefined,
  members: Member[]
): string | undefined {
  const member = serverId ? members.find((m) => m.serverId === serverId && m.userId === user?.id) : undefined
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
    serverId ? s.members.find((m) => m.serverId === serverId && m.userId === user?.id)?.displayName : undefined
  )
  return name ?? user?.displayName ?? user?.username
}
