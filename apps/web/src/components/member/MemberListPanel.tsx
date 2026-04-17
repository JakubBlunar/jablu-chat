import type { UserStatus } from '@chat/shared'
import { useMemo } from 'react'
import { SectionHeading } from '@/components/ui/SectionHeading'
import { UserAvatar } from '@/components/UserAvatar'
import type { Member } from '@/stores/member.store'
import { getRoleColor } from '@/stores/member.store'

export function resolveMemberPresence(m: Member, onlineIds: Set<string>): UserStatus {
  const s = m.user.status as UserStatus | undefined
  if (s === 'offline') return 'offline'
  if (!onlineIds.has(m.userId)) return 'offline'
  if (s === 'idle' || s === 'dnd' || s === 'online') return s
  return 'online'
}

export function MemberListPanel({
  members,
  onlineIds,
  isLoading,
  ownerId,
  onMemberClick,
  className = ''
}: {
  members: Member[]
  onlineIds: Set<string>
  isLoading: boolean
  ownerId: string | undefined
  onMemberClick: (member: Member, presence: UserStatus, rect: DOMRect) => void
  className?: string
}) {
  const { online, offline } = useMemo(() => {
    const on: Member[] = []
    const off: Member[] = []
    for (const m of members) {
      if (onlineIds.has(m.userId)) on.push(m)
      else off.push(m)
    }
    return { online: on, offline: off }
  }, [members, onlineIds])

  return (
    <div className={className}>
      {isLoading && members.length === 0 ? (
        <div className="space-y-3 px-2">
          <div className="h-3 w-20 animate-pulse rounded bg-white/10" />
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="h-8 w-8 animate-pulse rounded-full bg-white/10" />
              <div className="h-3 flex-1 animate-pulse rounded bg-white/10" />
            </div>
          ))}
        </div>
      ) : null}

      <section className="mb-4">
        <SectionHeading as="h3" className="mb-2 px-2">
          ONLINE — {online.length}
        </SectionHeading>
        <ul className="space-y-0.5">
          {online.map((m) => (
            <MemberRow
              key={m.userId}
              member={m}
              presence={resolveMemberPresence(m, onlineIds)}
              dimmed={false}
              onClick={onMemberClick}
              isOwner={ownerId === m.userId}
            />
          ))}
        </ul>
      </section>

      <section>
        <SectionHeading as="h3" className="mb-2 px-2">
          OFFLINE — {offline.length}
        </SectionHeading>
        <ul className="space-y-0.5">
          {offline.map((m) => (
            <MemberRow
              key={m.userId}
              member={m}
              presence="offline"
              dimmed
              onClick={onMemberClick}
              isOwner={ownerId === m.userId}
            />
          ))}
        </ul>
      </section>
    </div>
  )
}

function MemberRow({
  member,
  presence,
  dimmed,
  onClick,
  isOwner
}: {
  member: Member
  presence: UserStatus
  dimmed: boolean
  onClick: (member: Member, presence: UserStatus, rect: DOMRect) => void
  isOwner: boolean
}) {
  const name = member.user.displayName ?? member.user.username
  const roleColor = getRoleColor(member)
  const hasAdminRole = member.roles?.some((r) => r.isAdmin) ?? false
  const isBot = member.user.isBot

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    onClick(member, presence, rect)
  }

  return (
    <li>
      <button
        type="button"
        onClick={handleClick}
        className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition hover:bg-white/[0.04] ${
          dimmed ? 'opacity-50' : ''
        }`}
      >
        <UserAvatar username={name} avatarUrl={member.user.avatarUrl} size="md" showStatus status={presence} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={`truncate text-[15px] font-medium ${dimmed ? 'text-gray-200' : 'text-white'}`}
              style={dimmed ? undefined : roleColor ? { color: roleColor } : undefined}
            >
              {name}
            </span>
            {isBot && (
              <span className="shrink-0 rounded bg-primary/25 px-1.5 py-0 text-[10px] font-semibold uppercase tracking-wide text-primary">
                Bot
              </span>
            )}
            {isOwner && (
              <svg className="h-3.5 w-3.5 shrink-0 text-amber-400" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm0 2h14v2H5v-2z" />
              </svg>
            )}
            {!isOwner && hasAdminRole && (
              <svg className="h-3.5 w-3.5 shrink-0 text-blue-400" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z" />
              </svg>
            )}
          </div>
          {member.user.customStatus && (
            <p className="truncate text-xs text-gray-500">{member.user.customStatus}</p>
          )}
        </div>
      </button>
    </li>
  )
}
