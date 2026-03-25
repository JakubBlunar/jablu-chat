import type { UserStatus } from '@chat/shared'
import SimpleBar from 'simplebar-react'
import { UserAvatar } from '@/components/UserAvatar'
import { useAppNavigate } from '@/hooks/useAppNavigate'
import { useMemberStore } from '@/stores/member.store'

export function UserProfileIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}

const statusLabel: Record<string, string> = {
  online: 'Online',
  idle: 'Idle',
  dnd: 'Do Not Disturb',
  offline: 'Offline'
}

function dmFormatDate(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

function DmServerIcon({ name, iconUrl }: { name: string; iconUrl: string | null }) {
  if (iconUrl) {
    return <img src={iconUrl} alt={name} className="h-6 w-6 shrink-0 rounded-full object-cover" />
  }
  return (
    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/30 text-[11px] font-bold text-white">
      {name.charAt(0).toUpperCase()}
    </div>
  )
}

export function DmProfilePanel({
  member,
  mutualServers
}: {
  member: {
    userId: string
    username: string
    displayName?: string | null
    avatarUrl: string | null
    bio: string | null
    status: string
    createdAt: string
  }
  mutualServers?: { id: string; name: string; iconUrl: string | null; channels: { id: string; name: string }[] }[]
}) {
  const onlineIds = useMemberStore((s) => s.onlineUserIds)
  const resolvedStatus: UserStatus = onlineIds.has(member.userId)
    ? member.status === 'idle' || member.status === 'dnd'
      ? member.status
      : 'online'
    : 'offline'
  const { orchestratedGoToChannel } = useAppNavigate()

  return (
    <div className="flex w-full shrink-0 flex-col border-l border-white/5 bg-surface-dark md:w-[280px]">
      <SimpleBar className="flex-1">
        <div className="h-24 bg-primary" />
        <div className="px-4 pb-4">
          <div className="-mt-10">
            <div className="inline-block rounded-full border-[5px] border-surface-dark">
              <UserAvatar
                username={member.username}
                avatarUrl={member.avatarUrl}
                size="lg"
                showStatus
                status={resolvedStatus}
              />
            </div>
          </div>

          <h3 className="mt-1 text-lg font-bold text-white">{member.displayName ?? member.username}</h3>
          {member.displayName != null && member.displayName !== '' && member.displayName !== member.username && (
            <p className="text-sm text-gray-400">@{member.username}</p>
          )}
          <p className="text-xs text-gray-400">{statusLabel[resolvedStatus] ?? 'Offline'}</p>

          <div className="my-3 border-t border-white/10" />

          {member.bio && (
            <div className="mb-3">
              <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">About Me</p>
              <p className="whitespace-pre-wrap text-sm text-gray-200">{member.bio}</p>
            </div>
          )}

          {member.createdAt && (
            <div className="mb-3">
              <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Member Since</p>
              <p className="text-sm text-gray-200">{dmFormatDate(member.createdAt)}</p>
            </div>
          )}

          {mutualServers && mutualServers.length > 0 && (
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                Mutual Servers — {mutualServers.length}
              </p>
              <div className="space-y-1">
                {mutualServers.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => void orchestratedGoToChannel(s.id)}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left transition hover:bg-white/5"
                  >
                    <DmServerIcon name={s.name} iconUrl={s.iconUrl} />
                    <span className="min-w-0 truncate text-sm text-gray-200">{s.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </SimpleBar>
    </div>
  )
}
