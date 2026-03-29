import type { UserStatus, Role } from '@chat/shared'
import { Permission, PERMISSION_LABELS, permsToBigInt } from '@chat/shared'
import { useCallback, useEffect, useRef, useState } from 'react'
import SimpleBar from 'simplebar-react'
import { ModalOverlay } from '@/components/ui/ModalOverlay'
import { usePermissions } from '@/hooks/usePermissions'
import { useIsMobile } from '@/hooks/useMobile'
import { UserAvatar } from '@/components/UserAvatar'
import { api, resolveMediaUrl, type AuditLogEntry, type AutoModRule, type CustomEmoji, type EmojiStat } from '@/lib/api'
import { formatFullDateTime } from '@/lib/format-time'
import { useAuthStore } from '@/stores/auth.store'
import { useChannelStore } from '@/stores/channel.store'
import type { Member } from '@/stores/member.store'
import { useMemberStore } from '@/stores/member.store'
import type { Server } from '@/stores/server.store'
import { useServerStore } from '@/stores/server.store'

type Tab = 'overview' | 'roles' | 'members' | 'webhooks' | 'emoji-stats' | 'automod' | 'audit' | 'danger'

const SERVER_TABS: { key: Tab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'roles', label: 'Roles' },
  { key: 'members', label: 'Members' },
  { key: 'webhooks', label: 'Webhooks' },
  { key: 'emoji-stats', label: 'Emojis' },
  { key: 'automod', label: 'Auto-Mod' },
  { key: 'audit', label: 'Audit Log' },
  { key: 'danger', label: 'Danger Zone' }
]

export function ServerSettingsModal({ server, onClose }: { server: Server; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('overview')
  const isMobile = useIsMobile()

  const currentLabel = SERVER_TABS.find((t) => t.key === tab)?.label ?? 'Settings'

  const tabContent = (
    <>
      {tab === 'overview' && <OverviewTab server={server} />}
      {tab === 'roles' && <RolesTab server={server} />}
      {tab === 'members' && <MembersTab server={server} />}
      {tab === 'webhooks' && <WebhooksTab server={server} />}
      {tab === 'emoji-stats' && <EmojiStatsTab server={server} />}
      {tab === 'automod' && <AutoModTab server={server} />}
      {tab === 'audit' && <AuditLogTab server={server} />}
      {tab === 'danger' && <DangerTab server={server} onClose={onClose} />}
    </>
  )

  if (isMobile) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-surface" role="dialog" aria-modal="true" aria-label="Server Settings">
        <div className="flex h-12 shrink-0 items-center border-b border-white/10 px-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded p-2 text-gray-400 transition hover:bg-white/10 hover:text-white"
            aria-label="Close server settings"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="ml-2 text-base font-semibold text-white">{currentLabel}</h1>
        </div>
        <div className="shrink-0 overflow-x-auto border-b border-white/10 scrollbar-none">
          <div className="flex gap-1 px-2 py-1.5">
            {SERVER_TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap transition ${
                  tab === t.key ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <SimpleBar className="min-w-0 flex-1">
          <div className="px-4 py-4">{tabContent}</div>
        </SimpleBar>
      </div>
    )
  }

  return (
    <ModalOverlay onClose={onClose} maxWidth="max-w-[720px]" noPadding className="flex h-[80vh] overflow-hidden">
      <nav className="flex w-44 shrink-0 flex-col gap-0.5 bg-surface-darkest p-3">
        <h2 className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Server Settings</h2>
        {SERVER_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`rounded-md px-2 py-1.5 text-left text-sm transition ${
              tab === t.key ? 'bg-surface-selected text-white' : 'text-gray-300 hover:bg-white/[0.06] hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <h1 className="text-lg font-semibold text-white">{currentLabel}</h1>
          <button type="button" onClick={onClose} className="rounded p-1 text-gray-400 transition hover:text-white">
            <XIcon />
          </button>
        </div>

        <SimpleBar className="flex-1 p-6">{tabContent}</SimpleBar>
      </div>
    </ModalOverlay>
  )
}

function OverviewTab({ server }: { server: Server }) {
  const [name, setName] = useState(server.name)
  const [saving, setSaving] = useState(false)
  const [iconPreview, setIconPreview] = useState<string | null>(resolveMediaUrl(server.iconUrl) ?? null)
  const fileRef = useRef<HTMLInputElement>(null)
  const updateServerInList = useServerStore((s) => s.updateServerInList)

  const [error, setError] = useState<string | null>(null)

  const saveName = useCallback(async () => {
    if (!name.trim() || name === server.name) return
    setSaving(true)
    setError(null)
    try {
      await api.updateServer(server.id, { name: name.trim() })
      updateServerInList(server.id, { name: name.trim() })
    } catch {
      setError('Failed to update server name')
    } finally {
      setSaving(false)
    }
  }, [name, server, updateServerInList])

  const handleIconChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      const preview = URL.createObjectURL(file)
      setIconPreview((prev) => {
        if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev)
        return preview
      })
      try {
        const updated = (await api.uploadServerIcon(server.id, file)) as {
          iconUrl: string
        }
        updateServerInList(server.id, { iconUrl: updated.iconUrl })
        setIconPreview((prev) => {
          if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev)
          return updated.iconUrl
        })
      } catch {
        setIconPreview((prev) => {
          if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev)
          return server.iconUrl
        })
        setError('Failed to upload server icon')
      }
    },
    [server, updateServerInList]
  )

  const removeIcon = useCallback(async () => {
    try {
      await api.deleteServerIcon(server.id)
      updateServerInList(server.id, { iconUrl: null })
      setIconPreview(null)
    } catch {
      setError('Failed to remove icon')
    }
  }, [server.id, updateServerInList])

  useEffect(() => {
    return () => {
      if (iconPreview && iconPreview.startsWith('blob:')) URL.revokeObjectURL(iconPreview)
    }
  }, [])

  return (
    <div className="space-y-6">
      {error && <div className="rounded bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</div>}
      <div className="flex items-start gap-6">
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="group relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-primary text-3xl font-bold text-white transition hover:opacity-80"
          >
            {iconPreview ? (
              <img src={iconPreview} alt="Server icon" className="h-full w-full object-cover" />
            ) : (
              server.name.charAt(0).toUpperCase()
            )}
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition group-hover:opacity-100">
              <CameraIcon />
            </div>
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleIconChange} />
          {iconPreview && (
            <button type="button" onClick={removeIcon} className="text-xs text-red-400 hover:underline">
              Remove
            </button>
          )}
        </div>

        <div className="flex-1 space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">Server Name</label>
          <div className="flex gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              className="flex-1 rounded-md border border-white/10 bg-surface-darkest px-3 py-2 text-sm text-white outline-none focus:border-primary"
            />
            <button
              type="button"
              disabled={saving || !name.trim() || name === server.name}
              onClick={saveName}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Roles Tab ──────────────────────────────────────────

function RolesTab({ server }: { server: Server }) {
  const { has: hasPerm } = usePermissions(server.id)
  const canManage = hasPerm(Permission.MANAGE_ROLES)
  const [roles, setRoles] = useState<Role[]>([])
  const [selected, setSelected] = useState<Role | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState('#99aab5')
  const [editPerms, setEditPerms] = useState(0n)

  const fetchRoles = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.getRoles(server.id)
      setRoles(data)
    } catch {
      setError('Failed to load roles')
    } finally {
      setLoading(false)
    }
  }, [server.id])

  useEffect(() => { void fetchRoles() }, [fetchRoles])

  useEffect(() => {
    if (selected) {
      setEditName(selected.name)
      setEditColor(selected.color ?? '#99aab5')
      setEditPerms(permsToBigInt(selected.permissions))
    }
  }, [selected])

  const handleCreate = async () => {
    setError(null)
    try {
      const role = await api.createRole(server.id, { name: 'New Role', permissions: '0', color: '#99aab5' })
      setRoles((prev) => [...prev, role])
      setSelected(role)
    } catch {
      setError('Failed to create role')
    }
  }

  const handleSave = async () => {
    if (!selected) return
    setSaving(true)
    setError(null)
    try {
      const updated = await api.updateRole(server.id, selected.id, {
        name: editName,
        color: editColor,
        permissions: editPerms.toString()
      })
      setRoles((prev) => prev.map((r) => (r.id === updated.id ? updated : r)))
      setSelected(updated)
    } catch {
      setError('Failed to save role')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!selected || selected.isDefault) return
    if (!confirm(`Delete role "${selected.name}"? Members with this role will be moved to @everyone.`)) return
    setError(null)
    try {
      await api.deleteRole(server.id, selected.id)
      setRoles((prev) => prev.filter((r) => r.id !== selected.id))
      setSelected(null)
    } catch {
      setError('Failed to delete role')
    }
  }

  const togglePerm = (flag: bigint) => {
    setEditPerms((prev) => (prev & flag) === flag ? prev & ~flag : prev | flag)
  }

  if (loading) return <p className="py-4 text-center text-sm text-gray-500">Loading roles…</p>

  return (
    <div className="flex gap-4">
      {/* Role list */}
      <div className="w-48 shrink-0 space-y-1">
        {roles.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => setSelected(r)}
            className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition ${
              selected?.id === r.id ? 'bg-primary/20 text-white' : 'text-gray-300 hover:bg-white/[0.04]'
            }`}
          >
            <span
              className="inline-block h-3 w-3 shrink-0 rounded-full"
              style={{ backgroundColor: r.color ?? '#99aab5' }}
            />
            <span className="truncate">{r.name}</span>
          </button>
        ))}
        {canManage && (
          <button
            type="button"
            onClick={() => void handleCreate()}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-gray-400 transition hover:bg-white/[0.04] hover:text-white"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M12 4v16m8-8H4" /></svg>
            Create Role
          </button>
        )}
      </div>

      {/* Role editor */}
      <div className="min-w-0 flex-1">
        {error && (
          <div className="mb-3 rounded bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</div>
        )}

        {!selected ? (
          <p className="py-8 text-center text-sm text-gray-500">Select a role to edit</p>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <label className="mb-1 block text-xs font-medium text-gray-400">Role Name</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  disabled={!canManage || selected.isDefault}
                  className="w-full rounded-md bg-surface-darkest px-3 py-2 text-sm text-white outline-none ring-1 ring-white/10 focus:ring-primary disabled:opacity-50"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-400">Color</label>
                <input
                  type="color"
                  value={editColor}
                  onChange={(e) => setEditColor(e.target.value)}
                  disabled={!canManage}
                  className="h-9 w-14 cursor-pointer rounded-md border border-white/10 bg-surface-darkest disabled:opacity-50"
                />
              </div>
            </div>

            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Permissions</h4>
              <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                {Object.entries(Permission).map(([key, flag]) => (
                  <label
                    key={key}
                    className={`flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm transition hover:bg-white/[0.04] ${
                      (editPerms & flag) === flag ? 'text-white' : 'text-gray-400'
                    } ${!canManage ? 'pointer-events-none opacity-50' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={(editPerms & flag) === flag}
                      onChange={() => togglePerm(flag)}
                      disabled={!canManage}
                      className="accent-primary"
                    />
                    {PERMISSION_LABELS[key] ?? key}
                  </label>
                ))}
              </div>
            </div>

            {canManage && (
              <div className="flex items-center gap-2 border-t border-white/5 pt-4">
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={saving}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
                {!selected.isDefault && (
                  <button
                    type="button"
                    onClick={() => void handleDelete()}
                    className="rounded-md px-4 py-2 text-sm font-medium text-red-400 transition hover:bg-red-500/10"
                  >
                    Delete Role
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Members Tab ─────────────────────────────────────────

function MembersTab({ server }: { server: Server }) {
  const currentUser = useAuthStore((s) => s.user)
  const members = useMemberStore((s) => s.members)
  const onlineIds = useMemberStore((s) => s.onlineUserIds)
  const fetchMembers = useMemberStore((s) => s.fetchMembers)
  const { has: hasPerm } = usePermissions(server.id)
  const canManageRoles = hasPerm(Permission.MANAGE_ROLES)
  const canKick = hasPerm(Permission.KICK_MEMBERS)
  const [roles, setRoles] = useState<import('@chat/shared').Role[]>([])

  useEffect(() => {
    fetchMembers(server.id)
    api.getRoles(server.id).then(setRoles).catch(() => {})
  }, [server.id, fetchMembers])

  const [memberError, setMemberError] = useState<string | null>(null)

  const handleRoleChange = useCallback(
    async (member: Member, roleId: string) => {
      setMemberError(null)
      try {
        await api.assignRole(server.id, member.userId, roleId)
        fetchMembers(server.id)
      } catch {
        setMemberError(`Failed to change role for ${member.user.displayName ?? member.user.username}`)
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

  return (
    <div className="space-y-1">
      {memberError && (
        <div className="mb-2 rounded bg-red-500/10 px-3 py-2 text-xs text-red-400">{memberError}</div>
      )}
      {members.map((m) => {
        const presence: UserStatus = onlineIds.has(m.userId) ? ((m.user.status as UserStatus) ?? 'online') : 'offline'
        const isSelf = m.userId === currentUser?.id
        const isMemberOwner = m.userId === server.ownerId
        const roleName = m.role?.name ?? '@everyone'
        const roleColor = m.role?.color

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
              {!m.role?.isDefault && (
                <span
                  className="ml-2 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1"
                  style={roleColor ? { color: roleColor, borderColor: `${roleColor}66` } : { color: 'var(--color-primary)', borderColor: 'var(--color-primary)' }}
                >
                  {roleName}
                </span>
              )}
            </div>

            {!isSelf && !isMemberOwner && (
              <div className="flex items-center gap-2">
                {canManageRoles && roles.length > 0 && (
                  <select
                    value={m.roleId}
                    onChange={(e) => handleRoleChange(m, e.target.value)}
                    className="rounded border border-white/10 bg-surface-darkest px-2 py-1 text-xs text-white outline-none"
                  >
                    {roles.map((r) => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
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
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function DangerTab({ server, onClose }: { server: Server; onClose: () => void }) {
  const currentUser = useAuthStore((s) => s.user)
  const removeServer = useServerStore((s) => s.removeServer)
  const [confirmText, setConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const isOwner = currentUser?.id === server.ownerId

  const handleDelete = useCallback(async () => {
    if (confirmText !== server.name) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await api.deleteServer(server.id)
      removeServer(server.id)
      onClose()
    } catch {
      setDeleteError('Failed to delete server')
      setDeleting(false)
    }
  }, [confirmText, server, removeServer, onClose])

  if (!isOwner) {
    return <p className="text-sm text-gray-400">Only the server owner can delete this server.</p>
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-red-500/40 bg-red-500/10 p-4">
        <h3 className="text-sm font-semibold text-red-400">Delete Server</h3>
        <p className="mt-1 text-sm text-gray-300">
          This will permanently delete <strong className="text-white">{server.name}</strong>, all channels, messages,
          and uploaded files. This action cannot be undone.
        </p>
        <div className="mt-4 space-y-2">
          <label className="text-xs text-gray-400">
            Type <strong className="text-white">{server.name}</strong> to confirm
          </label>
          <input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={server.name}
            className="w-full rounded-md border border-white/10 bg-surface-darkest px-3 py-2 text-sm text-white outline-none focus:border-red-500"
          />
          <button
            type="button"
            disabled={confirmText !== server.name || deleting}
            onClick={handleDelete}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-50"
          >
            {deleting ? 'Deleting…' : 'Delete Server'}
          </button>
          {deleteError && <p className="mt-2 text-xs text-red-400">{deleteError}</p>}
        </div>
      </div>
    </div>
  )
}

type WebhookItem = {
  id: string
  channelId: string
  name: string
  token: string
  createdAt: string
}

function WebhooksTab({ server: _server }: { server: Server }) {
  const channels = useChannelStore((s) => s.channels)
  const textChannels = channels.filter((c) => c.type === 'text')
  const [webhooks, setWebhooks] = useState<WebhookItem[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [channelId, setChannelId] = useState(textChannels[0]?.id ?? '')
  const [creating, setCreating] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [webhookError, setWebhookError] = useState<string | null>(null)

  const fetchWebhooks = useCallback(async () => {
    const all: WebhookItem[] = []
    for (const ch of textChannels) {
      try {
        const list = await api.getWebhooks(ch.id)
        all.push(...(list as WebhookItem[]))
      } catch {
        /* no access */
      }
    }
    setWebhooks(all)
    setLoading(false)
  }, [textChannels])

  useEffect(() => {
    void fetchWebhooks()
  }, [fetchWebhooks])

  const handleCreate = useCallback(async () => {
    if (!name.trim() || !channelId) return
    setCreating(true)
    setWebhookError(null)
    try {
      await api.createWebhook(channelId, name.trim())
      setName('')
      await fetchWebhooks()
    } catch {
      setWebhookError('Failed to create webhook')
    } finally {
      setCreating(false)
    }
  }, [name, channelId, fetchWebhooks])

  const handleDelete = useCallback(async (id: string) => {
    setWebhookError(null)
    try {
      await api.deleteWebhook(id)
      setWebhooks((prev) => prev.filter((w) => w.id !== id))
    } catch {
      setWebhookError('Failed to delete webhook')
    }
  }, [])

  const copyUrl = useCallback((wh: WebhookItem) => {
    const base = window.location.origin
    const url = `${base}/api/webhooks/${wh.token}/execute`
    void navigator.clipboard.writeText(url)
    setCopiedId(wh.id)
    setTimeout(() => setCopiedId(null), 2000)
  }, [])

  if (loading) {
    return <p className="text-sm text-gray-400">Loading…</p>
  }

  return (
    <div className="space-y-6">
      {webhookError && (
        <div className="rounded bg-red-500/10 px-3 py-2 text-xs text-red-400">{webhookError}</div>
      )}
      <div className="rounded-md bg-surface-dark p-4">
        <h3 className="mb-3 text-sm font-semibold text-white">Create Webhook</h3>
        <div className="flex items-end gap-3">
          <div className="flex-1 space-y-1">
            <label className="text-xs text-gray-400">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              placeholder="My Webhook"
              className="w-full rounded border border-white/10 bg-surface-darkest px-3 py-2 text-sm text-white outline-none focus:border-primary"
            />
          </div>
          <div className="w-40 space-y-1">
            <label className="text-xs text-gray-400">Channel</label>
            <select
              value={channelId}
              onChange={(e) => setChannelId(e.target.value)}
              className="w-full rounded border border-white/10 bg-surface-darkest px-2 py-2 text-sm text-white outline-none"
            >
              {textChannels.map((ch) => (
                <option key={ch.id} value={ch.id}>
                  #{ch.name}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            disabled={creating || !name.trim()}
            onClick={() => void handleCreate()}
            className="rounded bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover disabled:opacity-50"
          >
            Create
          </button>
        </div>
      </div>

      {webhooks.length === 0 ? (
        <p className="text-center text-sm text-gray-500">No webhooks yet.</p>
      ) : (
        <div className="space-y-2">
          {webhooks.map((wh) => {
            const ch = channels.find((c) => c.id === wh.channelId)
            return (
              <div key={wh.id} className="flex items-center gap-3 rounded-md bg-surface-dark px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white">{wh.name}</p>
                  <p className="text-xs text-gray-500">
                    #{ch?.name ?? 'unknown'} &middot; {new Date(wh.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => copyUrl(wh)}
                  className="rounded px-3 py-1 text-xs font-medium text-primary transition hover:bg-primary/10"
                >
                  {copiedId === wh.id ? 'Copied!' : 'Copy URL'}
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete(wh.id)}
                  className="rounded p-1 text-red-400 transition hover:bg-red-500/20"
                  title="Delete webhook"
                >
                  <TrashIcon />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function AutoModTab({ server }: { server: Server }) {
  const [rules, setRules] = useState<AutoModRule[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    api
      .getAutoModRules(server.id)
      .then(setRules)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [server.id])

  const handleToggle = useCallback(
    async (type: string, enabled: boolean) => {
      const rule = rules.find((r) => r.type === type)
      if (!rule) return
      setSaving(type)
      try {
        const updated = await api.updateAutoModRule(server.id, type, enabled, rule.config)
        setRules((prev) => prev.map((r) => (r.type === type ? updated : r)))
      } catch {}
      setSaving(null)
    },
    [server.id, rules]
  )

  const handleConfigChange = useCallback(
    async (type: string, config: Record<string, unknown>) => {
      const rule = rules.find((r) => r.type === type)
      if (!rule) return
      setSaving(type)
      try {
        const updated = await api.updateAutoModRule(server.id, type, rule.enabled, config)
        setRules((prev) => prev.map((r) => (r.type === type ? updated : r)))
      } catch {}
      setSaving(null)
    },
    [server.id, rules]
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-600 border-t-primary" />
      </div>
    )
  }

  const wordRule = rules.find((r) => r.type === 'word_filter')
  const linkRule = rules.find((r) => r.type === 'link_filter')
  const spamRule = rules.find((r) => r.type === 'spam_detection')

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-400">Configure automatic content filtering and spam prevention for this server.</p>

      {wordRule && (
        <AutoModCard
          title="Word Filter"
          description="Block messages containing specific words"
          enabled={wordRule.enabled}
          saving={saving === 'word_filter'}
          onToggle={(enabled) => handleToggle('word_filter', enabled)}
        >
          <WordFilterConfig
            config={wordRule.config as { words?: string[]; action?: string }}
            onSave={(config) => handleConfigChange('word_filter', config)}
          />
        </AutoModCard>
      )}

      {linkRule && (
        <AutoModCard
          title="Link Filter"
          description="Control which links can be shared"
          enabled={linkRule.enabled}
          saving={saving === 'link_filter'}
          onToggle={(enabled) => handleToggle('link_filter', enabled)}
        >
          <LinkFilterConfig
            config={linkRule.config as { blockAll?: boolean; allowedDomains?: string[] }}
            onSave={(config) => handleConfigChange('link_filter', config)}
          />
        </AutoModCard>
      )}

      {spamRule && (
        <AutoModCard
          title="Spam Detection"
          description="Limit message rate and duplicate content"
          enabled={spamRule.enabled}
          saving={saving === 'spam_detection'}
          onToggle={(enabled) => handleToggle('spam_detection', enabled)}
        >
          <SpamDetectionConfig
            config={spamRule.config as { maxDuplicates?: number; windowSeconds?: number; maxMessagesPerMinute?: number }}
            onSave={(config) => handleConfigChange('spam_detection', config)}
          />
        </AutoModCard>
      )}
    </div>
  )
}

function AutoModCard({
  title,
  description,
  enabled,
  saving,
  onToggle,
  children
}: {
  title: string
  description: string
  enabled: boolean
  saving: boolean
  onToggle: (enabled: boolean) => void
  children: React.ReactNode
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-surface-dark p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-white">{title}</h3>
          <p className="mt-0.5 text-xs text-gray-500">{description}</p>
        </div>
        <button
          type="button"
          onClick={() => onToggle(!enabled)}
          disabled={saving}
          className={`relative h-6 w-11 shrink-0 rounded-full transition ${enabled ? 'bg-primary' : 'bg-gray-600'}`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-5' : 'translate-x-0.5'}`}
          />
        </button>
      </div>
      {enabled && <div className="mt-4 border-t border-white/5 pt-4">{children}</div>}
    </div>
  )
}

function WordFilterConfig({
  config,
  onSave
}: {
  config: { words?: string[]; action?: string }
  onSave: (config: Record<string, unknown>) => void
}) {
  const [input, setInput] = useState('')
  const words = config.words ?? []
  const action = config.action ?? 'block'

  const addWord = () => {
    const word = input.trim().toLowerCase()
    if (word && !words.includes(word)) {
      onSave({ words: [...words, word], action })
      setInput('')
    }
  }

  const removeWord = (word: string) => {
    onSave({ words: words.filter((w) => w !== word), action })
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addWord()}
          placeholder="Add a word..."
          className="min-w-0 flex-1 rounded-md border border-white/10 bg-surface px-3 py-1.5 text-sm text-white placeholder-gray-500 outline-none focus:border-primary"
        />
        <button
          type="button"
          onClick={addWord}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/80"
        >
          Add
        </button>
      </div>
      {words.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {words.map((w) => (
            <span key={w} className="flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-0.5 text-xs text-gray-300">
              {w}
              <button type="button" onClick={() => removeWord(w)} className="text-gray-500 hover:text-red-400">
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function LinkFilterConfig({
  config,
  onSave
}: {
  config: { blockAll?: boolean; allowedDomains?: string[] }
  onSave: (config: Record<string, unknown>) => void
}) {
  const [input, setInput] = useState('')
  const blockAll = config.blockAll ?? false
  const allowedDomains = config.allowedDomains ?? []

  const addDomain = () => {
    const domain = input.trim().toLowerCase()
    if (domain && !allowedDomains.includes(domain)) {
      onSave({ blockAll, allowedDomains: [...allowedDomains, domain] })
      setInput('')
    }
  }

  const removeDomain = (domain: string) => {
    onSave({ blockAll, allowedDomains: allowedDomains.filter((d) => d !== domain) })
  }

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-sm text-gray-300">
        <input
          type="checkbox"
          checked={blockAll}
          onChange={(e) => onSave({ blockAll: e.target.checked, allowedDomains })}
          className="rounded border-white/20 bg-surface text-primary focus:ring-primary/50"
        />
        Block all links (except allowed domains)
      </label>
      {blockAll && (
        <>
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addDomain()}
              placeholder="e.g. youtube.com"
              className="min-w-0 flex-1 rounded-md border border-white/10 bg-surface px-3 py-1.5 text-sm text-white placeholder-gray-500 outline-none focus:border-primary"
            />
            <button
              type="button"
              onClick={addDomain}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/80"
            >
              Allow
            </button>
          </div>
          {allowedDomains.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {allowedDomains.map((d) => (
                <span key={d} className="flex items-center gap-1 rounded-full bg-green-900/30 px-2.5 py-0.5 text-xs text-green-300">
                  {d}
                  <button type="button" onClick={() => removeDomain(d)} className="text-green-500 hover:text-red-400">
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function SpamDetectionConfig({
  config,
  onSave
}: {
  config: { maxDuplicates?: number; windowSeconds?: number; maxMessagesPerMinute?: number }
  onSave: (config: Record<string, unknown>) => void
}) {
  const maxDuplicates = config.maxDuplicates ?? 3
  const windowSeconds = config.windowSeconds ?? 60
  const maxMessagesPerMinute = config.maxMessagesPerMinute ?? 10

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-300">Max messages per minute</span>
          <span className="font-mono text-white">{maxMessagesPerMinute}</span>
        </div>
        <input
          type="range"
          min={3}
          max={30}
          value={maxMessagesPerMinute}
          onChange={(e) =>
            onSave({ maxDuplicates, windowSeconds, maxMessagesPerMinute: Number(e.target.value) })
          }
          className="mt-1 w-full accent-primary"
        />
      </div>
      <div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-300">Max duplicate messages</span>
          <span className="font-mono text-white">{maxDuplicates}</span>
        </div>
        <input
          type="range"
          min={1}
          max={10}
          value={maxDuplicates}
          onChange={(e) =>
            onSave({ maxDuplicates: Number(e.target.value), windowSeconds, maxMessagesPerMinute })
          }
          className="mt-1 w-full accent-primary"
        />
      </div>
      <div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-300">Duplicate window (seconds)</span>
          <span className="font-mono text-white">{windowSeconds}s</span>
        </div>
        <input
          type="range"
          min={10}
          max={300}
          step={10}
          value={windowSeconds}
          onChange={(e) =>
            onSave({ maxDuplicates, windowSeconds: Number(e.target.value), maxMessagesPerMinute })
          }
          className="mt-1 w-full accent-primary"
        />
      </div>
    </div>
  )
}

function EmojiStatsTab({ server }: { server: Server }) {
  const { has: hasPerm } = usePermissions(server.id)
  const canManage = hasPerm(Permission.MANAGE_EMOJIS)

  const [emojis, setEmojis] = useState<CustomEmoji[]>([])
  const [stats, setStats] = useState<EmojiStat[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [uploadName, setUploadName] = useState('')
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadPreview, setUploadPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  useEffect(() => {
    setLoading(true)
    setError(null)
    Promise.all([
      api.getEmojis(server.id),
      api.getEmojiStats(server.id)
    ])
      .then(([e, s]) => { setEmojis(e); setStats(s) })
      .catch(() => setError('Failed to load emojis'))
      .finally(() => setLoading(false))
  }, [server.id])

  const statsMap = new Map(stats.map((s) => [s.emoji, s]))

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadFile(file)
    setUploadPreview(URL.createObjectURL(file))
    if (!uploadName) {
      setUploadName(file.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase().slice(0, 32))
    }
  }

  const handleUpload = async () => {
    if (!uploadFile || !uploadName.trim()) return
    setUploading(true)
    setError(null)
    try {
      const emoji = await api.uploadEmoji(server.id, uploadName.trim(), uploadFile)
      setEmojis((prev) => [...prev, emoji])
      setUploadName('')
      setUploadFile(null)
      if (uploadPreview) URL.revokeObjectURL(uploadPreview)
      setUploadPreview(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const handleRename = async (emojiId: string) => {
    if (!renameValue.trim()) return
    setError(null)
    try {
      const updated = await api.renameEmoji(server.id, emojiId, renameValue.trim())
      setEmojis((prev) => prev.map((e) => (e.id === emojiId ? updated : e)))
      setRenamingId(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Rename failed')
    }
  }

  const handleDelete = async (emoji: CustomEmoji) => {
    if (!confirm(`Delete :${emoji.name}:? This cannot be undone.`)) return
    setError(null)
    try {
      await api.deleteEmoji(server.id, emoji.id)
      setEmojis((prev) => prev.filter((e) => e.id !== emoji.id))
    } catch {
      setError('Failed to delete emoji')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-600 border-t-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</div>
      )}

      {/* Upload section */}
      {canManage && (
        <div className="space-y-3 rounded-lg bg-surface-darkest p-4">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Upload Emoji</h4>
          <div className="flex items-end gap-3">
            <div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex h-16 w-16 items-center justify-center rounded-lg border-2 border-dashed border-white/10 transition hover:border-primary/50"
              >
                {uploadPreview ? (
                  <img src={uploadPreview} alt="" className="h-12 w-12 object-contain" />
                ) : (
                  <svg className="h-6 w-6 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path d="M12 4v16m8-8H4" />
                  </svg>
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>
            <div className="min-w-0 flex-1">
              <label className="mb-1 block text-xs text-gray-400">Name</label>
              <input
                type="text"
                value={uploadName}
                onChange={(e) => setUploadName(e.target.value.replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase().slice(0, 32))}
                placeholder="emoji_name"
                className="w-full rounded-md bg-surface px-3 py-2 text-sm text-white outline-none ring-1 ring-white/10 focus:ring-primary"
              />
            </div>
            <button
              type="button"
              onClick={() => void handleUpload()}
              disabled={!uploadFile || !uploadName.trim() || uploading}
              className="shrink-0 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover disabled:opacity-50"
            >
              {uploading ? 'Uploading...' : 'Upload'}
            </button>
          </div>
          <p className="text-[11px] text-gray-500">PNG, JPG, GIF, or WebP. Max 200 KB. Will be resized to 128x128.</p>
        </div>
      )}

      {/* Emoji list */}
      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
          Emojis — {emojis.length}/50
        </h4>
        {emojis.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-500">No custom emojis yet.</p>
        ) : (
          <div className="space-y-1">
            {emojis.map((e) => {
              const stat = statsMap.get(e.name)
              const isRenaming = renamingId === e.id
              return (
                <div key={e.id} className="flex items-center gap-3 rounded-md px-3 py-2 transition hover:bg-white/[0.04]">
                  <img
                    src={resolveMediaUrl(e.imageUrl)}
                    alt={e.name}
                    className="h-8 w-8 shrink-0 object-contain"
                  />
                  {isRenaming ? (
                    <input
                      type="text"
                      value={renameValue}
                      onChange={(ev) => setRenameValue(ev.target.value.replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase().slice(0, 32))}
                      onKeyDown={(ev) => {
                        if (ev.key === 'Enter') void handleRename(e.id)
                        if (ev.key === 'Escape') setRenamingId(null)
                      }}
                      autoFocus
                      className="min-w-0 flex-1 rounded bg-surface-darkest px-2 py-1 text-sm text-white outline-none ring-1 ring-white/10 focus:ring-primary"
                    />
                  ) : (
                    <div className="min-w-0 flex-1">
                      <span className="text-sm font-medium text-white">:{e.name}:</span>
                      {stat && (
                        <span className="ml-2 text-xs text-gray-500">
                          {stat.usageCount} reaction{stat.usageCount !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  )}
                  {canManage && (
                    <div className="flex shrink-0 items-center gap-1">
                      {isRenaming ? (
                        <>
                          <button
                            type="button"
                            onClick={() => void handleRename(e.id)}
                            className="rounded px-2 py-1 text-xs text-primary transition hover:bg-primary/10"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setRenamingId(null)}
                            className="rounded px-2 py-1 text-xs text-gray-400 transition hover:bg-white/5"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => { setRenamingId(e.id); setRenameValue(e.name) }}
                            title="Rename"
                            className="rounded p-1.5 text-gray-400 transition hover:bg-white/10 hover:text-white"
                          >
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDelete(e)}
                            title="Delete"
                            className="rounded p-1.5 text-gray-400 transition hover:bg-red-500/10 hover:text-red-400"
                          >
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function AuditLogTab({ server }: { server: Server }) {
  const [entries, setEntries] = useState<AuditLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(false)
  const [logError, setLogError] = useState<string | null>(null)

  const fetchLog = useCallback(
    async (cursor?: string) => {
      setLoading(true)
      setLogError(null)
      try {
        const data = await api.getAuditLog(server.id, 50, cursor)
        if (cursor) {
          setEntries((prev) => [...prev, ...data.entries])
        } else {
          setEntries(data.entries)
        }
        setHasMore(data.hasMore)
      } catch {
        setLogError('Failed to load audit log')
      } finally {
        setLoading(false)
      }
    },
    [server.id]
  )

  useEffect(() => {
    void fetchLog()
  }, [fetchLog])

  const loadMore = useCallback(() => {
    const last = entries[entries.length - 1]
    if (last) void fetchLog(last.createdAt)
  }, [entries, fetchLog])

  return (
    <div className="space-y-3">
      {logError && <div className="rounded bg-red-500/10 px-3 py-2 text-xs text-red-400">{logError}</div>}
      {entries.length === 0 && !loading ? (
        <p className="text-center text-sm text-gray-500">No audit log entries yet.</p>
      ) : (
        <div className="space-y-1">
          {entries.map((e) => (
            <div key={e.id} className="flex items-start gap-3 rounded-md px-3 py-2 hover:bg-white/[0.04]">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-white">
                  <span className="font-semibold text-primary">
                    {e.actor?.displayName ?? e.actor?.username ?? 'Unknown'}
                  </span>{' '}
                  <span className="font-medium">{e.action}</span>
                  {e.targetType && <span className="text-gray-400"> &middot; {e.targetType}</span>}
                </p>
                {e.details && <p className="mt-0.5 text-xs text-gray-500">{e.details}</p>}
              </div>
              <time className="shrink-0 text-xs text-gray-500">{formatFullDateTime(e.createdAt)}</time>
            </div>
          ))}
        </div>
      )}
      {loading && <p className="text-center text-sm text-gray-400">Loading…</p>}
      {hasMore && !loading && (
        <button
          type="button"
          onClick={loadMore}
          className="mx-auto block rounded bg-surface-dark px-4 py-2 text-xs text-gray-300 ring-1 ring-white/10 hover:bg-surface-selected"
        >
          Load more
        </button>
      )}
    </div>
  )
}

function TrashIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  )
}

function XIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.3 5.71a1 1 0 00-1.42 0L12 10.59 7.12 5.71A1 1 0 105.7 7.12L10.59 12l-4.88 4.88a1 1 0 101.42 1.42L12 13.41l4.88 4.88a1 1 0 001.42-1.42L13.41 12l4.88-4.88a1 1 0 000-1.41z" />
    </svg>
  )
}

function CameraIcon() {
  return (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 15.2a3.2 3.2 0 100-6.4 3.2 3.2 0 000 6.4z" />
      <path d="M9 2l-1.83 2H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V6a2 2 0 00-2-2h-3.17L15 2H9zm3 15a5 5 0 110-10 5 5 0 010 10z" />
    </svg>
  )
}

function KickIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <circle cx="8.5" cy="7" r="4" />
      <line x1="18" y1="8" x2="23" y2="13" />
      <line x1="23" y1="8" x2="18" y2="13" />
    </svg>
  )
}
