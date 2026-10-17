import { useMemo } from 'react'
import { shallow } from 'zustand/shallow'
import type { MemberMentionRef, RoleMentionRef } from '@/lib/markdownMentions'
import { getRoleColor, useMemberStore, type Member } from '@/stores/member.store'

export function createChatLookupSelector(serverId: string | null) {
  let members: Member[] | undefined
  let result = {
    membersByUsername: new Map<string, MemberMentionRef>(),
    rolesByLowerName: new Map<string, RoleMentionRef>(),
    authorColors: new Map<string, string | null>()
  }
  return (state: { members: Member[] }) => {
    if (state.members === members) return result
    members = state.members
    const names = new Map<string, MemberMentionRef>()
    const roles = new Map<string, RoleMentionRef>()
    const colors = new Map<string, string | null>()
    for (const member of members) {
      if (serverId && member.serverId !== serverId) continue
      const key = member.user.username.toLowerCase()
      const previous = result.membersByUsername.get(key)
      names.set(
        key,
        previous?.user.username === member.user.username && previous.user.displayName === member.user.displayName
          ? previous
          : { user: { username: member.user.username, displayName: member.user.displayName } }
      )
      colors.set(member.userId, getRoleColor(member))
      for (const role of member.roles ?? []) {
        if (role.isDefault) continue
        const name = role.name.toLowerCase()
        const previousRole = result.rolesByLowerName.get(name)
        roles.set(
          name,
          previousRole?.id === role.id && previousRole.name === role.name && previousRole.color === role.color
            ? previousRole
            : { id: role.id, name: role.name, color: role.color }
        )
      }
    }
    const next = {
      membersByUsername: shallow(names, result.membersByUsername) ? result.membersByUsername : names,
      rolesByLowerName: shallow(roles, result.rolesByLowerName) ? result.rolesByLowerName : roles,
      authorColors: shallow(colors, result.authorColors) ? result.authorColors : colors
    }
    if (!shallow(next, result)) result = next
    return result
  }
}

export function useChatLookups(serverId: string | null) {
  const selector = useMemo(() => createChatLookupSelector(serverId), [serverId])
  return useMemberStore(selector)
}
