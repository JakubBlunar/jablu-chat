import type { UserStatus } from '@chat/shared'
import { useCallback, useState } from 'react'
import SimpleBar from 'simplebar-react'
import { ProfileCard, type ProfileCardUser } from '@/components/ProfileCard'
import { SectionHeading } from '@/components/ui/SectionHeading'
import type { Member } from '@/stores/member.store'
import { getTopRole, getRoleColor, useMemberStore } from '@/stores/member.store'
import { useServerStore } from '@/stores/server.store'
import { MemberListPanel } from '@/components/member/MemberListPanel'

export function MemberSidebar() {
  const members = useMemberStore((s) => s.members)
  const onlineIds = useMemberStore((s) => s.onlineUserIds)
  const isLoading = useMemberStore((s) => s.isLoading)
  const server = useServerStore((s) => s.servers.find((sv) => sv.id === s.currentServerId))

  const [cardUser, setCardUser] = useState<ProfileCardUser | null>(null)
  const [cardRect, setCardRect] = useState<DOMRect | null>(null)

  const closeCard = useCallback(() => setCardUser(null), [])

  const handleMemberClick = useCallback((member: Member, presence: UserStatus, rect: DOMRect) => {
    const topRole = getTopRole(member)
    setCardUser({
      id: member.userId,
      username: member.user.username,
      displayName: member.user.displayName,
      avatarUrl: member.user.avatarUrl,
      bio: member.user.bio ?? null,
      isBot: member.user.isBot,
      status: presence,
      customStatus: member.user.customStatus ?? null,
      joinedAt: member.joinedAt,
      roleName: topRole && !topRole.isDefault ? topRole.name : null,
      roleColor: getRoleColor(member)
    })
    setCardRect(rect)
  }, [])

  const total = members.length

  return (
    <aside className="flex h-full w-full shrink-0 flex-col bg-surface-dark md:w-60">
      <div className="flex h-12 shrink-0 items-center border-b border-black/20 px-4">
        <SectionHeading as="h2">MEMBERS — {total}</SectionHeading>
      </div>

      <SimpleBar className="min-h-0 flex-1 px-2 py-3">
        <MemberListPanel
          members={members}
          onlineIds={onlineIds}
          isLoading={isLoading}
          ownerId={server?.ownerId}
          onMemberClick={handleMemberClick}
        />
      </SimpleBar>

      {cardUser && <ProfileCard user={cardUser} onClose={closeCard} anchorRect={cardRect} />}
    </aside>
  )
}
