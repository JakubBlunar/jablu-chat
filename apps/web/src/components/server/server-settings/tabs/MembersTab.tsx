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
import { ServerProfileModal } from '@/components/server/ServerProfileModal'
import { memberDisplayName } from '@/lib/serverProfile'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { Input, Spinner } from '@/components/ui'
import { ListPagination, useListPage } from '../ListControls'

const TIMEOUT_OPTIONS = [
  { labelKey: '60Seconds', value: 60 },
  { labelKey: '5Minutes', value: 300 },
  { labelKey: '10Minutes', value: 600 },
  { labelKey: '1Hour', value: 3600 },
  { labelKey: '1Day', value: 86400 },
  { labelKey: '1Week', value: 604800 }
]

function formatTimeLeft(iso: string, t: TFunction<'server-settings'>): string {
  const diff = new Date(iso).getTime() - Date.now()
  if (diff <= 0) return ''
  const mins = Math.ceil(diff / 60_000)
  if (mins < 60) return t('members.timeLeftMinutes', { count: mins })
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return t('members.timeLeftHours', { count: hrs })
  return t('members.timeLeftDays', { count: Math.floor(hrs / 24) })
}

export function MembersTab({ server }: { server: Server }) {
  const { t: tNav } = useTranslation('nav')
  const { t } = useTranslation('server-settings')
  const [profileUserId, setProfileUserId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [roleDraft, setRoleDraft] = useState<{ userId: string; ids: string[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyUserId, setBusyUserId] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
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
  const canManageProfiles = hasPerm(Permission.MANAGE_SERVER)
  const [roles, setRoles] = useState<import('@chat/shared').Role[]>([])

  useEffect(() => {
    setLoading(true)
    setMemberError(null)
    Promise.all([fetchMembers(server.id), api.getRoles(server.id).then(setRoles)])
      .catch(() => setMemberError(t('members.loadFailed')))
      .finally(() => setLoading(false))
  }, [server.id, fetchMembers, t, retry])

  const [memberError, setMemberError] = useState<string | null>(null)

  const handleRolesChange = useCallback(
    async (member: Member, nextRoleIds: string[]) => {
      setMemberError(null)
      setBusyUserId(member.userId)
      try {
        await api.assignRoles(server.id, member.userId, nextRoleIds)
        await fetchMembers(server.id)
      } catch {
        setMemberError(t('members.changeRolesFailed', { name: member.user.displayName ?? member.user.username }))
      } finally {
        setBusyUserId(null)
      }
    },
    [server.id, fetchMembers, t]
  )

  const handleKick = useCallback(
    async (member: Member) => {
      if (!confirm(t('members.kickConfirm', { name: member.user.displayName ?? member.user.username }))) return
      setMemberError(null)
      setBusyUserId(member.userId)
      try {
        await api.kickMember(server.id, member.userId)
        await fetchMembers(server.id)
      } catch {
        setMemberError(t('members.kickFailed', { name: member.user.displayName ?? member.user.username }))
      } finally {
        setBusyUserId(null)
      }
    },
    [server.id, fetchMembers, t]
  )

  const handleBan = useCallback(
    async (member: Member) => {
      const reason = prompt(t('members.banPrompt', { name: member.user.displayName ?? member.user.username }))
      if (reason === null) return
      setMemberError(null)
      setBusyUserId(member.userId)
      try {
        await api.banMember(server.id, member.userId, reason || undefined)
        await fetchMembers(server.id)
      } catch {
        setMemberError(t('members.banFailed', { name: member.user.displayName ?? member.user.username }))
      } finally {
        setBusyUserId(null)
      }
    },
    [server.id, fetchMembers, t]
  )

  const handleTimeout = useCallback(
    async (member: Member, duration: number) => {
      const name = member.user.displayName ?? member.user.username
      const reasonInput = prompt(t('members.timeoutPrompt', { name }))
      if (reasonInput === null) return
      const reason = reasonInput.trim()
      setMemberError(null)
      setBusyUserId(member.userId)
      try {
        await api.timeoutMember(server.id, member.userId, duration, reason || undefined)
        await fetchMembers(server.id)
      } catch {
        setMemberError(t('members.timeoutFailed', { name }))
      } finally {
        setBusyUserId(null)
      }
    },
    [server.id, fetchMembers, t]
  )

  const handleRemoveTimeout = useCallback(
    async (member: Member) => {
      setMemberError(null)
      setBusyUserId(member.userId)
      try {
        await api.removeTimeout(server.id, member.userId)
        await fetchMembers(server.id)
      } catch {
        setMemberError(t('members.removeTimeoutFailed', { name: member.user.displayName ?? member.user.username }))
      } finally {
        setBusyUserId(null)
      }
    },
    [server.id, fetchMembers, t]
  )

  const assignableRoles = roles.filter((r) => !r.isDefault)
  const query = search.trim().toLocaleLowerCase()
  const filtered = members
    .filter((m) => m.serverId === server.id)
    .filter(
      (m) =>
        !query ||
        [memberDisplayName(m), m.user.username, m.user.displayName, m.userId].some((value) =>
          value?.toLocaleLowerCase().includes(query)
        )
    )
    .filter((m) => !roleFilter || m.roleIds.includes(roleFilter))
    .filter(
      (m) =>
        !statusFilter ||
        (statusFilter === 'timed-out'
          ? !!m.mutedUntil && new Date(m.mutedUntil).getTime() > Date.now()
          : statusFilter === 'online'
            ? onlineIds.has(m.userId) && m.user.status !== 'invisible'
            : !onlineIds.has(m.userId) || m.user.status === 'invisible')
    )
  const pagination = useListPage(filtered, JSON.stringify([search, roleFilter, statusFilter]))

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_140px_140px]">
        <Input
          size="sm"
          aria-label={t('members.search')}
          placeholder={t('members.search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select
          size="sm"
          aria-label={t('members.roleFilter')}
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
        >
          <option value="">{t('members.allRoles')}</option>
          {roles.map((role) => (
            <option key={role.id} value={role.id}>
              {role.name}
            </option>
          ))}
        </Select>
        <Select
          size="sm"
          aria-label={t('members.statusFilter')}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">{t('members.allStatuses')}</option>
          <option value="online">{t('members.online')}</option>
          <option value="offline">{t('members.offline')}</option>
          <option value="timed-out">{t('members.timeout')}</option>
        </Select>
      </div>
      {memberError && (
        <InlineAlert variant="error">
          {memberError}
          <Button type="button" size="sm" variant="secondary" onClick={() => setRetry((value) => value + 1)}>
            {t('lists.retry')}
          </Button>
        </InlineAlert>
      )}
      <div className="flex flex-col gap-2">
        {loading ? (
          <div className="flex justify-center py-12">
            <Spinner size="md" />
          </div>
        ) : (
          pagination.items.map((m) => {
            const presence: UserStatus = onlineIds.has(m.userId)
              ? ((m.user.status as UserStatus) ?? 'online')
              : 'offline'
            const isSelf = m.userId === currentUser?.id
            const isMemberOwner = m.userId === server.ownerId
            const memberRoles = (m.roles ?? []).filter((r) => !r.isDefault)
            const roleColor = getRoleColor(m)
            const isMuted = m.mutedUntil ? new Date(m.mutedUntil) > new Date() : false
            const timeLeft = isMuted && m.mutedUntil ? formatTimeLeft(m.mutedUntil, t) : ''
            const showActions = !isSelf && !isMemberOwner

            return (
              <div key={m.userId} className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
                <div className="flex min-w-0 items-center gap-3">
                  <UserAvatar
                    username={m.user.username}
                    avatarUrl={m.user.avatarUrl}
                    size="md"
                    showStatus
                    status={presence}
                  />
                  <div className="min-w-0 flex-1">
                    <p
                      className="truncate text-sm font-medium"
                      style={roleColor ? { color: roleColor } : { color: '#9ca3af' }}
                    >
                      {memberDisplayName(m)}
                    </p>
                    <p className="truncate text-xs text-gray-500">@{m.user.username}</p>

                    {(memberRoles.length > 0 || isMuted) && (
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        {memberRoles.map((r) => (
                          <RoleBadge key={r.id} name={r.name} color={r.color} size="sm" />
                        ))}
                        {isMuted && (
                          <span
                            className="rounded bg-yellow-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-yellow-400"
                            title={m.mutedReason ?? undefined}
                          >
                            {t('members.timedOut', { timeLeft })}
                            {m.mutedReason ? ` · ${t('members.withReason')}` : ''}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  {showActions && (canManageRoles || canMute || canKick || canBan || canManageProfiles) ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      aria-expanded={expandedId === m.userId}
                      onClick={() => setExpandedId(expandedId === m.userId ? null : m.userId)}
                    >
                      {t('members.manage')}
                    </Button>
                  ) : (
                    canManageProfiles &&
                    (!isMemberOwner || isSelf) && (
                      <Button type="button" variant="secondary" size="sm" onClick={() => setProfileUserId(m.userId)}>
                        {tNav('profileEdit')}
                      </Button>
                    )
                  )}
                </div>
                {showActions && expandedId === m.userId && (
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/5 pt-3">
                    {canManageProfiles && (
                      <Button type="button" variant="secondary" size="sm" onClick={() => setProfileUserId(m.userId)}>
                        {tNav('profileEdit')}
                      </Button>
                    )}
                    {canManageRoles && assignableRoles.length > 0 && (
                      <>
                        <MultiSelect
                          size="sm"
                          disabled={busyUserId !== null}
                          buttonLabel={t('members.roles')}
                          icon={<RolesIcon />}
                          options={assignableRoles.map((r) => ({ value: r.id, label: r.name, color: r.color }))}
                          value={
                            roleDraft?.userId === m.userId
                              ? roleDraft.ids
                              : (m.roleIds ?? []).filter((id) => assignableRoles.some((r) => r.id === id))
                          }
                          onChange={(ids) => setRoleDraft({ userId: m.userId, ids })}
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          disabled={
                            busyUserId !== null ||
                            roleDraft?.userId !== m.userId ||
                            (roleDraft.ids.length ===
                              m.roleIds.filter((id) => assignableRoles.some((r) => r.id === id)).length &&
                              roleDraft.ids.every((id) => m.roleIds.includes(id)))
                          }
                          onClick={() => roleDraft && void handleRolesChange(m, roleDraft.ids)}
                        >
                          {t('members.saveRoles')}
                        </Button>
                      </>
                    )}
                    {canMute &&
                      (isMuted ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => handleRemoveTimeout(m)}
                          disabled={busyUserId !== null}
                          title={t('members.removeTimeout')}
                          className="text-yellow-400 hover:bg-yellow-500/20 hover:text-yellow-400"
                        >
                          {t('members.untimeout')}
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
                          title={t('members.timeout')}
                          disabled={busyUserId !== null}
                        >
                          <option value="" disabled>
                            {t('members.timeout')}
                          </option>
                          {TIMEOUT_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {t(`members.timeouts.${o.labelKey}`)}
                            </option>
                          ))}
                        </Select>
                      ))}
                    {canKick && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => handleKick(m)}
                        disabled={busyUserId !== null}
                        title={t('members.kick')}
                        aria-label={t('members.kick')}
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
                        disabled={busyUserId !== null}
                        title={t('members.ban')}
                        className="text-red-400 hover:bg-red-500/20 hover:text-red-400"
                      >
                        {t('members.ban')}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
        {!loading && filtered.length === 0 && (
          <p className="py-10 text-center text-sm text-gray-400">{t('lists.noResults')}</p>
        )}
      </div>
      {!loading && <ListPagination {...pagination} />}
      {profileUserId && (
        <ServerProfileModal serverId={server.id} userId={profileUserId} onClose={() => setProfileUserId(null)} />
      )}
    </div>
  )
}

function RolesIcon() {
  return (
    <svg
      className="h-3.5 w-3.5 shrink-0 text-gray-400"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden
    >
      <path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
}
