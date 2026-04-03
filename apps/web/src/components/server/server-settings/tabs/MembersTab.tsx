import type { UserStatus } from '@chat/shared'
import { Permission } from '@chat/shared'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { createPortal } from 'react-dom'
import { usePermissions } from '@/hooks/usePermissions'
import { api } from '@/lib/api'
import { ColorDot } from '@/components/ui/ColorDot'
import { InlineAlert } from '@/components/ui/InlineAlert'
import { RoleBadge } from '@/components/ui/RoleBadge'
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

  const handleRoleToggle = useCallback(
    async (member: Member, roleId: string) => {
      setMemberError(null)
      const defaultIds = new Set((member.roles ?? []).filter((r) => r.isDefault).map((r) => r.id))
      const current = new Set((member.roleIds ?? []).filter((id) => !defaultIds.has(id)))
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
        <InlineAlert variant="error" className="mb-2">{memberError}</InlineAlert>
      )}
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
          <div key={m.userId} className="flex items-center gap-3 rounded-md px-3 py-2 hover:bg-white/[0.04]">
            <UserAvatar
              username={m.user.username}
              avatarUrl={m.user.avatarUrl}
              size="md"
              showStatus
              status={presence}
            />
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
              <span className="text-sm font-medium" style={roleColor ? { color: roleColor } : { color: '#9ca3af' }}>
                {m.user.displayName ?? m.user.username}
              </span>
              {memberRoles.map((r) => (
                <RoleBadge key={r.id} name={r.name} color={r.color} size="sm" />
              ))}
              {isMuted && (
                <span className="rounded bg-yellow-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-yellow-400">
                  Timed out {timeLeft && `· ${timeLeft}`}
                </span>
              )}
            </div>

            {showActions && (
              <div className="flex shrink-0 items-center gap-1.5">
                {canManageRoles && roles.length > 0 && (
                  <RoleDropdown
                    roles={roles.filter((r) => !r.isDefault)}
                    activeIds={m.roleIds ?? []}
                    onToggle={(roleId) => handleRoleToggle(m, roleId)}
                  />
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

function RoleDropdown({
  roles,
  activeIds,
  onToggle
}: {
  roles: import('@chat/shared').Role[]
  activeIds: string[]
  onToggle: (roleId: string) => void
}) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ top: 0, left: 0 })

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (
        btnRef.current?.contains(e.target as Node) ||
        panelRef.current?.contains(e.target as Node)
      ) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handler, true)
    return () => document.removeEventListener('mousedown', handler, true)
  }, [open])

  const handleToggle = () => {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      setPos({ top: rect.bottom + 4, left: rect.right })
    }
    setOpen((v) => !v)
  }

  const activeCount = roles.filter((r) => activeIds.includes(r.id)).length

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={handleToggle}
        className="flex items-center gap-1 rounded border border-white/10 px-2 py-1 text-xs text-gray-300 transition hover:bg-white/5"
      >
        <svg className="h-3.5 w-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        Roles
        {activeCount > 0 && (
          <span className="rounded-full bg-primary/20 px-1.5 text-[10px] font-semibold text-primary">{activeCount}</span>
        )}
        <svg className={`h-3 w-3 text-gray-500 transition ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && createPortal(
        <div
          ref={panelRef}
          className="fixed z-[200] min-w-[180px] overflow-hidden rounded-lg bg-surface-darkest py-1 shadow-xl ring-1 ring-white/10"
          style={{ top: pos.top, left: pos.left, transform: 'translateX(-100%)' }}
        >
          {roles.map((r) => {
            const isActive = activeIds.includes(r.id)
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => onToggle(r.id)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition hover:bg-white/5"
              >
                <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                  isActive ? 'border-primary bg-primary' : 'border-gray-600'
                }`}>
                  {isActive && (
                    <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </span>
                <ColorDot color={r.color} size="sm" />
                <span className={`truncate ${isActive ? 'text-white' : 'text-gray-400'}`}>{r.name}</span>
              </button>
            )
          })}
        </div>,
        document.body
      )}
    </>
  )
}
