import type { Member } from '@/stores/member.store'

// Member arrays are immutable snapshots, including test/bootstrap replacements.
// Build once per snapshot rather than scanning the roster in every subscriber.
const indexes = new WeakMap<readonly Member[], Map<string, Map<string, Member>>>()

export function findMember(
  members: readonly Member[],
  serverId: string | null | undefined,
  userId: string | null | undefined
): Member | undefined {
  if (!serverId || !userId) return undefined
  let index = indexes.get(members)
  if (!index) {
    index = new Map()
    for (const member of members) {
      let server = index.get(member.serverId)
      if (!server) index.set(member.serverId, (server = new Map()))
      if (!server.has(member.userId)) server.set(member.userId, member)
    }
    indexes.set(members, index)
  }
  return index.get(serverId)?.get(userId)
}
