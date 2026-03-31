import type { UserStatus } from '@chat/shared'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ProfileCardUser } from '@/components/ProfileCard'
import { getRoleColor, useMemberStore } from '@/stores/member.store'

export function useProfileCard(
  isDm: boolean,
  currentConv: {
    members: {
      userId: string
      username: string
      displayName?: string | null
      avatarUrl: string | null
      bio: string | null
      status: string
      createdAt: string
    }[]
  } | null
) {
  const [cardUser, setCardUser] = useState<ProfileCardUser | null>(null)
  const [cardRect, setCardRect] = useState<DOMRect | null>(null)
  const closeCard = useCallback(() => setCardUser(null), [])

  const membersRef = useRef(useMemberStore.getState().members)
  const onlineIdsRef = useRef(useMemberStore.getState().onlineUserIds)
  useEffect(() => {
    return useMemberStore.subscribe((s) => {
      membersRef.current = s.members
      onlineIdsRef.current = s.onlineUserIds
    })
  }, [])
  const currentConvRef = useRef(currentConv)
  currentConvRef.current = currentConv

  const handleUserClick = useCallback(
    (authorId: string, rect: DOMRect) => {
      if (isDm) {
        const convMember = currentConvRef.current?.members.find((m) => m.userId === authorId)
        if (!convMember) return
        setCardUser({
          id: convMember.userId,
          username: convMember.username,
          avatarUrl: convMember.avatarUrl,
          bio: convMember.bio,
          status: (convMember.status as UserStatus) ?? 'offline',
          joinedAt: convMember.createdAt
        })
      } else {
        const member = membersRef.current.find((m) => m.userId === authorId)
        if (!member) return
        const status: UserStatus = !onlineIdsRef.current.has(authorId)
          ? 'offline'
          : (member.user.status as UserStatus) || 'online'
        setCardUser({
          id: member.userId,
          username: member.user.username,
          displayName: member.user.displayName,
          avatarUrl: member.user.avatarUrl,
          bio: member.user.bio,
          status,
          joinedAt: member.joinedAt,
          roleName: (() => { const r = member.roles?.filter((r) => !r.isDefault); return r && r.length > 0 ? r.reduce((a, b) => a.position > b.position ? a : b).name : null })(),
          roleColor: getRoleColor(member)
        })
      }
      setCardRect(rect)
    },
    [isDm]
  )

  const handleMentionClick = useCallback((username: string, rect: DOMRect) => {
    const member = membersRef.current.find((m) => m.user.username.toLowerCase() === username.toLowerCase())
    if (!member) return
    const status: UserStatus = !onlineIdsRef.current.has(member.userId)
      ? 'offline'
      : (member.user.status as UserStatus) || 'online'
    setCardUser({
      id: member.userId,
      username: member.user.username,
      displayName: member.user.displayName,
      avatarUrl: member.user.avatarUrl,
      bio: member.user.bio,
      status,
      joinedAt: member.joinedAt,
      roleName: (() => { const r = member.roles?.filter((r) => !r.isDefault); return r && r.length > 0 ? r.reduce((a, b) => a.position > b.position ? a : b).name : null })(),
      roleColor: getRoleColor(member)
    })
    setCardRect(rect)
  }, [])

  return { cardUser, cardRect, closeCard, handleUserClick, handleMentionClick }
}
