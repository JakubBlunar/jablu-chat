import type { UserStatus } from '@chat/shared'
import { memo, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { GroupedVirtuoso } from 'react-virtuoso'
import { SectionHeading } from '@/components/ui/SectionHeading'
import { UserAvatar } from '@/components/UserAvatar'
import { ActivityLine } from '@/components/user/ActivityLine'
import { useActivityStore } from '@/stores/activity.store'
import { useAuthStore } from '@/stores/auth.store'
import { useServerStore } from '@/stores/server.store'
import { prefetchProfileCard } from '@/stores/profileCard.store'
import type { Member } from '@/stores/member.store'
import { getRoleColor } from '@/stores/member.store'
import { memberDisplayName } from '@/lib/serverProfile'

export function resolveMemberPresence(m: Member, onlineIds: Set<string>): UserStatus {
  const s = m.user.status as UserStatus | undefined
  if (s === 'offline') return 'offline'
  if (!onlineIds.has(m.userId)) return 'offline'
  if (s === 'idle' || s === 'dnd' || s === 'online') return s
  return 'online'
}

export const MemberListPanel = memo(function MemberListPanel({
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
  const { t } = useTranslation('server')
  const { online, offline } = useMemo(() => {
    const on: Member[] = []
    const off: Member[] = []
    for (const m of members) {
      if (onlineIds.has(m.userId)) on.push(m)
      else off.push(m)
    }
    return { online: on, offline: off }
  }, [members, onlineIds])

  if (members.length > 100) {
    const ordered = [...online, ...offline]
    return (
      <GroupedVirtuoso
        className={className}
        style={{ height: '100%' }}
        groupCounts={[online.length, offline.length]}
        defaultItemHeight={48}
        overscan={200}
        computeItemKey={(index) => {
          // Virtuoso's key index includes group headers; itemContent's does not.
          if (index === 0 || index === online.length + 1) return `group-${index}`
          return ordered[index - (index > online.length ? 2 : 1)].userId
        }}
        groupContent={(index) => (
          <SectionHeading as="h3" className="bg-surface-dark px-2 py-2">
            {t(index === 0 ? 'members.online' : 'members.offline', { count: index === 0 ? online.length : offline.length })}
          </SectionHeading>
        )}
        itemContent={(index) => {
          const m = ordered[index]
          return <MemberRow member={m} presence={resolveMemberPresence(m, onlineIds)} dimmed={!onlineIds.has(m.userId)} onClick={onMemberClick} isOwner={ownerId === m.userId} />
        }}
      />
    )
  }

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
          {t('members.online', { count: online.length })}
        </SectionHeading>
        <div role="list" className="space-y-0.5">
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
        </div>
      </section>

      <section>
        <SectionHeading as="h3" className="mb-2 px-2">
          {t('members.offline', { count: offline.length })}
        </SectionHeading>
        <div role="list" className="space-y-0.5">
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
        </div>
      </section>
    </div>
  )
})

const MemberRow = memo(function MemberRow({
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
  const { t } = useTranslation('server')
  const name = memberDisplayName(member)
  const roleColor = getRoleColor(member)
  const hasAdminRole = member.roles?.some((r) => r.isAdmin) ?? false
  const isBot = member.user.isBot
  const storedActivity = useActivityStore((s) => s.activities.get(member.userId))
  const isSelf = useAuthStore((s) => s.user?.id === member.userId)
  const currentServerId = useServerStore((s) => s.currentServerId)
  // Hide our own activity from ourselves in servers where we've hidden sharing,
  // so the member list reflects what everyone else on that server actually sees.
  const selfHiddenHere = useActivityStore((s) =>
    isSelf &&
    !!currentServerId &&
    s.hiddenServerIds.includes(currentServerId)
  )
  const activity = selfHiddenHere ? undefined : storedActivity

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    onClick(member, presence, rect)
  }

  return (
    <div role="listitem">
      <button
        type="button"
        onClick={handleClick}
        onMouseEnter={() => prefetchProfileCard(member.userId, isBot)}
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
                {t('members.bot')}
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
          {activity ? (
            <ActivityLine activity={activity} />
          ) : member.user.customStatus ? (
            <p className="truncate text-xs text-gray-500">{member.user.customStatus}</p>
          ) : null}
        </div>
      </button>
    </div>
  )
})
