import type { UserStatus } from '@chat/shared'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ProfileCardUser } from '@/components/ProfileCard'
import { useMemberStore } from '@/stores/member.store'

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
        const status: UserStatus =
          (member.user.status as UserStatus) ?? (onlineIdsRef.current.has(authorId) ? 'online' : 'offline')
        setCardUser({
          id: member.userId,
          username: member.user.username,
          displayName: member.user.displayName,
          avatarUrl: member.user.avatarUrl,
          bio: member.user.bio,
          status,
          joinedAt: member.joinedAt,
          role: member.role
        })
      }
      setCardRect(rect)
    },
    [isDm]
  )

  const handleMentionClick = useCallback((username: string, rect: DOMRect) => {
    const member = membersRef.current.find((m) => m.user.username.toLowerCase() === username.toLowerCase())
    if (!member) return
    const status: UserStatus =
      (member.user.status as UserStatus) ?? (onlineIdsRef.current.has(member.userId) ? 'online' : 'offline')
    setCardUser({
      id: member.userId,
      username: member.user.username,
      displayName: member.user.displayName,
      avatarUrl: member.user.avatarUrl,
      bio: member.user.bio,
      status,
      joinedAt: member.joinedAt,
      role: member.role
    })
    setCardRect(rect)
  }, [])

  return { cardUser, cardRect, closeCard, handleUserClick, handleMentionClick }
}
