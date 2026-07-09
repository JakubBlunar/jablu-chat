import type { UserStatus } from '@chat/shared'
import { Permission } from '@chat/shared'
import { useCallback, useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { usePermissions } from '@/hooks/usePermissions'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/Button'
import { InlineAlert } from '@/components/ui/InlineAlert'
import { MultiSelect } from '@/components/ui/MultiSelect'
import { RoleBadge } from '@/components/ui/RoleBadge'
import { Select } from '@/components/ui/Select'
import { UserAvatar } from '@/components/UserAvatar'
import { useAuthStore } from '@/stores/auth.store'
import type { Member } from '@/stores/member.store'
import { getRoleColor, useMemberStore } from '@/stores/member.store'
import type { Server } from '@/stores/server.store'
import { KickIcon } from '../serverSettingsIcons'

const TIMEOUT_OPTIONS = [
  { label: '60 sec', value: 60 },
  { label: '5 min', value: 300 },
  { label: '10 min', value: 600 },
  { label: '1 hour', value: 3600 },
  { label: '1 day', value: 86400 },
  { label: '1 week', value: 604800 },
]

function formatTimeLeft(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now()
  if (diff <= 0) return ''
  const mins = Math.ceil(diff / 60_000)
  if (mins < 60) return `${mins}m left`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h left`
  return `${Math.floor(hrs / 24)}d left`
}

export function MembersTab({ server }: { server: Server }) {
  const currentUser = useAuthStore((s) => s.user)
  const { members, onlineIds, fetchMembers } = useMemberStore(
    useShallow((s) => ({
      members: s.members,
      onlineIds: s.onlineUserIds,
      fetchMembers: s.fetchMembers
    }))
  )
  const { has: hasPerm } = usePermissions(server.id)
  const canManageRoles = hasPerm(Permission.MANAGE_ROLES)
  const canKick = hasPerm(Permission.KICK_MEMBERS)
  const canBan = hasPerm(Permission.BAN_MEMBERS)
  const canMute = hasPerm(Permission.MUTE_MEMBERS)
  const [roles, setRoles] = useState<import('@chat/shared').Role[]>([])

  useEffect(() => {
    fetchMembers(server.id)
    api.getRoles(server.id).then(setRoles).catch(() => {})
  }, [server.id, fetchMembers])

  const [memberError, setMemberError] = useState<string | null>(null)

  const handleRolesChange = useCallback(
    async (member: Member, nextRoleIds: string[]) => {
      setMemberError(null)
      try {
        await api.assignRoles(server.id, member.userId, nextRoleIds)
        fetchMembers(server.id)
      } catch {
        setMemberError(`Failed to change roles for ${member.user.displayName ?? member.user.username}`)
      }
    },
    [server.id, fetchMembers]
  )

  const handleKick = useCallback(
    async (member: Member) => {
      if (!confirm(`Kick ${member.user.displayName ?? member.user.username} from the server?`)) return
      setMemberError(null)
      try {
        await api.kickMember(server.id, member.userId)
        fetchMembers(server.id)
      } catch {
        setMemberError(`Failed to kick ${member.user.displayName ?? member.user.username}`)
      }
    },
    [server.id, fetchMembers]
  )

  const handleBan = useCallback(
    async (member: Member) => {
      const reason = prompt(`Ban ${member.user.displayName ?? member.user.username}? Enter an optional reason:`)
      if (reason === null) return
      setMemberError(null)
      try {
        await api.banMember(server.id, member.userId, reason || undefined)
        fetchMembers(server.id)
      } catch {
        setMemberError(`Failed to ban ${member.user.displayName ?? member.user.username}`)
      }
    },
    [server.id, fetchMembers]
  )

  const handleTimeout = useCallback(
    async (member: Member, duration: number) => {
      const name = member.user.displayName ?? member.user.username
      const reasonInput = prompt(`Timeout ${name}. Optional reason:`)
      if (reasonInput === null) return
      const reason = reasonInput.trim()
      setMemberError(null)
      try {
        await api.timeoutMember(server.id, member.userId, duration, reason || undefined)
        fetchMembers(server.id)
      } catch {
        setMemberError(`Failed to timeout ${name}`)
      }
    },
    [server.id, fetchMembers]
  )

  const handleRemoveTimeout = useCallback(
    async (member: Member) => {
      setMemberError(null)
      try {
        await api.removeTimeout(server.id, member.userId)
        fetchMembers(server.id)
      } catch {
        setMemberError(`Failed to remove timeout for ${member.user.displayName ?? member.user.username}`)
      }
    },
    [server.id, fetchMembers]
  )

  const assignableRoles = roles.filter((r) => !r.isDefault)

  return (
    <div className="space-y-2">
      {memberError && (
        <InlineAlert variant="error">{memberError}</InlineAlert>
      )}
      <div className="flex flex-col gap-2">
      {members.map((m) => {
        const presence: UserStatus = onlineIds.has(m.userId) ? ((m.user.status as UserStatus) ?? 'online') : 'offline'
        const isSelf = m.userId === currentUser?.id
        const isMemberOwner = m.userId === server.ownerId
        const memberRoles = (m.roles ?? []).filter((r) => !r.isDefault)
        const roleColor = getRoleColor(m)
        const isMuted = m.mutedUntil ? new Date(m.mutedUntil) > new Date() : false
        const timeLeft = isMuted && m.mutedUntil ? formatTimeLeft(m.mutedUntil) : ''
        const showActions = !isSelf && !isMemberOwner

        return (
          <div key={m.userId} className="flex flex-col gap-2 rounded-lg border border-white/5 bg-white/[0.02] p-3">
            <div className="flex min-w-0 items-center gap-3">
              <UserAvatar
                username={m.user.username}
                avatarUrl={m.user.avatarUrl}
                size="md"
                showStatus
                status={presence}
              />
              <span
                className="min-w-0 flex-1 truncate text-sm font-medium"
                style={roleColor ? { color: roleColor } : { color: '#9ca3af' }}
              >
                {m.user.displayName ?? m.user.username}
              </span>
            </div>

            {(memberRoles.length > 0 || isMuted) && (
              <div className="flex flex-wrap items-center gap-1">
                {memberRoles.map((r) => (
                  <RoleBadge key={r.id} name={r.name} color={r.color} size="sm" />
                ))}
                {isMuted && (
                  <span
                    className="rounded bg-yellow-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-yellow-400"
                    title={m.mutedReason ?? undefined}
                  >
                    Timed out {timeLeft && `· ${timeLeft}`}
                    {m.mutedReason ? ' · with reason' : ''}
                  </span>
                )}
              </div>
            )}

            {showActions && (
              <div className="mt-auto flex flex-wrap items-center gap-1.5 border-t border-white/5 pt-2">
                {canManageRoles && assignableRoles.length > 0 && (
                  <MultiSelect
                    size="sm"
                    buttonLabel="Roles"
                    icon={<RolesIcon />}
                    options={assignableRoles.map((r) => ({ value: r.id, label: r.name, color: r.color }))}
                    value={(m.roleIds ?? []).filter((id) => assignableRoles.some((r) => r.id === id))}
                    onChange={(next) => handleRolesChange(m, next)}
                  />
                )}
                {canMute && (
                  isMuted ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => handleRemoveTimeout(m)}
                      title="Remove timeout"
                      className="text-yellow-400 hover:bg-yellow-500/20 hover:text-yellow-400"
                    >
                      Untimeout
                    </Button>
                  ) : (
                    <Select
                      size="sm"
                      wrapperClassName="w-28"
                      defaultValue=""
                      onChange={(e) => {
                        const val = Number(e.target.value)
                        if (val > 0) handleTimeout(m, val)
                        e.target.value = ''
                      }}
                      title="Timeout member"
                    >
                      <option value="" disabled>Timeout</option>
                      {TIMEOUT_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </Select>
                  )
                )}
                {canKick && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => handleKick(m)}
                    title="Kick member"
                    className="px-2 text-red-400 hover:bg-red-500/20 hover:text-red-400"
                  >
                    <KickIcon />
                  </Button>
                )}
                {canBan && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => handleBan(m)}
                    title="Ban member"
                    className="text-red-400 hover:bg-red-500/20 hover:text-red-400"
                  >
                    Ban
                  </Button>
                )}
              </div>
            )}
          </div>
        )
      })}
      </div>
    </div>
  )
}

function RolesIcon() {
  return (
    <svg className="h-3.5 w-3.5 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
}
