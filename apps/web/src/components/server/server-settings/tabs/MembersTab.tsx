import type { UserStatus } from '@chat/shared'
import { Permission } from '@chat/shared'
import { useCallback, useEffect, useState } from 'react'
import { usePermissions } from '@/hooks/usePermissions'
import { api } from '@/lib/api'
import { UserAvatar } from '@/components/UserAvatar'
import { useAuthStore } from '@/stores/auth.store'
import type { Member } from '@/stores/member.store'
import { useMemberStore } from '@/stores/member.store'
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
  const members = useMemberStore((s) => s.members)
  const onlineIds = useMemberStore((s) => s.onlineUserIds)
  const fetchMembers = useMemberStore((s) => s.fetchMembers)
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

  const handleRoleToggle = useCallback(
    async (member: Member, roleId: string) => {
      setMemberError(null)
      const current = new Set(member.roleIds ?? [])
      if (current.has(roleId)) current.delete(roleId)
      else current.add(roleId)
      try {
        await api.assignRoles(server.id, member.userId, Array.from(current))
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
      setMemberError(null)
      try {
        await api.timeoutMember(server.id, member.userId, duration)
        fetchMembers(server.id)
      } catch {
        setMemberError(`Failed to timeout ${member.user.displayName ?? member.user.username}`)
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

  return (
    <div className="space-y-1">
      {memberError && (
        <div className="mb-2 rounded bg-red-500/10 px-3 py-2 text-xs text-red-400">{memberError}</div>
      )}
      {members.map((m) => {
        const presence: UserStatus = onlineIds.has(m.userId) ? ((m.user.status as UserStatus) ?? 'online') : 'offline'
        const isSelf = m.userId === currentUser?.id
        const isMemberOwner = m.userId === server.ownerId
        const memberRoles = (m.roles ?? []).filter((r) => !r.isDefault)
        const topRole = memberRoles.length > 0 ? memberRoles.reduce((a, b) => a.position > b.position ? a : b) : undefined
        const roleColor = topRole?.color
        const isMuted = m.mutedUntil ? new Date(m.mutedUntil) > new Date() : false
        const timeLeft = isMuted && m.mutedUntil ? formatTimeLeft(m.mutedUntil) : ''

        return (
          <div key={m.userId} className="flex items-center gap-3 rounded-md px-3 py-2 hover:bg-white/[0.04]">
            <UserAvatar
              username={m.user.username}
              avatarUrl={m.user.avatarUrl}
              size="md"
              showStatus
              status={presence}
            />
            <div className="min-w-0 flex-1">
              <span className="text-sm font-medium" style={roleColor ? { color: roleColor } : { color: 'white' }}>
                {m.user.displayName ?? m.user.username}
              </span>
              {memberRoles.map((r) => (
                <span
                  key={r.id}
                  className="ml-1 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1"
                  style={r.color ? { color: r.color, borderColor: `${r.color}66` } : { color: 'var(--color-primary)', borderColor: 'var(--color-primary)' }}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: r.color ?? 'var(--color-primary)' }} />
                  {r.name}
                </span>
              ))}
              {isMuted && (
                <span className="ml-2 rounded bg-yellow-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-yellow-400">
                  Timed out {timeLeft && `· ${timeLeft}`}
                </span>
              )}
            </div>

            {!isSelf && !isMemberOwner && (
              <div className="flex items-center gap-2">
                {canManageRoles && roles.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {roles.filter((r) => !r.isDefault).map((r) => {
                      const isActive = m.roleIds?.includes(r.id) ?? false
                      return (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => handleRoleToggle(m, r.id)}
                          className={`rounded border px-2 py-0.5 text-[10px] font-medium transition ${
                            isActive ? 'border-primary bg-primary/20 text-white' : 'border-white/10 text-gray-400 hover:bg-white/5'
                          }`}
                        >
                          {r.name}
                        </button>
                      )
                    })}
                  </div>
                )}
                {canMute && (
                  isMuted ? (
                    <button
                      type="button"
                      onClick={() => handleRemoveTimeout(m)}
                      title="Remove timeout"
                      className="rounded px-2 py-1 text-xs text-yellow-400 transition hover:bg-yellow-500/20"
                    >
                      Untimeout
                    </button>
                  ) : (
                    <select
                      defaultValue=""
                      onChange={(e) => {
                        const val = Number(e.target.value)
                        if (val > 0) handleTimeout(m, val)
                        e.target.value = ''
                      }}
                      title="Timeout member"
                      className="rounded border border-white/10 bg-surface-darkest px-2 py-1 text-xs text-yellow-400 outline-none"
                    >
                      <option value="" disabled>Timeout</option>
                      {TIMEOUT_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  )
                )}
                {canKick && (
                  <button
                    type="button"
                    onClick={() => handleKick(m)}
                    title="Kick member"
                    className="rounded p-1 text-red-400 transition hover:bg-red-500/20"
                  >
                    <KickIcon />
                  </button>
                )}
                {canBan && (
                  <button
                    type="button"
                    onClick={() => handleBan(m)}
                    title="Ban member"
                    className="rounded px-2 py-1 text-xs text-red-400 transition hover:bg-red-500/20"
                  >
                    Ban
                  </button>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
