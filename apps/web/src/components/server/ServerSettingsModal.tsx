import type { UserStatus } from '@chat/shared'
import { useCallback, useEffect, useRef, useState } from 'react'
import SimpleBar from 'simplebar-react'
import { ModalOverlay } from '@/components/ui/ModalOverlay'
import { useIsMobile } from '@/hooks/useMobile'
import { UserAvatar } from '@/components/UserAvatar'
import { api, type AuditLogEntry } from '@/lib/api'
import { formatFullDateTime } from '@/lib/format-time'
import { useAuthStore } from '@/stores/auth.store'
import { useChannelStore } from '@/stores/channel.store'
import type { Member } from '@/stores/member.store'
import { useMemberStore } from '@/stores/member.store'
import type { Server } from '@/stores/server.store'
import { useServerStore } from '@/stores/server.store'

type Tab = 'overview' | 'members' | 'webhooks' | 'audit' | 'danger'

const SERVER_TABS: { key: Tab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'members', label: 'Members' },
  { key: 'webhooks', label: 'Webhooks' },
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
      {tab === 'members' && <MembersTab server={server} />}
      {tab === 'webhooks' && <WebhooksTab server={server} />}
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
  const [iconPreview, setIconPreview] = useState<string | null>(server.iconUrl)
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

function MembersTab({ server }: { server: Server }) {
  const currentUser = useAuthStore((s) => s.user)
  const members = useMemberStore((s) => s.members)
  const onlineIds = useMemberStore((s) => s.onlineUserIds)
  const fetchMembers = useMemberStore((s) => s.fetchMembers)
  const isOwner = currentUser?.id === server.ownerId
  const myMembership = members.find((m) => m.userId === currentUser?.id)
  const isAdminOrOwner = isOwner || myMembership?.role === 'admin'

  useEffect(() => {
    fetchMembers(server.id)
  }, [server.id, fetchMembers])

  const [memberError, setMemberError] = useState<string | null>(null)

  const handleRoleChange = useCallback(
    async (member: Member, newRole: string) => {
      setMemberError(null)
      try {
        await api.updateMemberRole(server.id, member.userId, newRole)
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
        const isMemberOwner = m.role === 'owner'

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
              <span className="text-sm font-medium text-white">{m.user.displayName ?? m.user.username}</span>
              {m.role !== 'member' && (
                <span className="ml-2 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary ring-1 ring-primary/40">
                  {m.role}
                </span>
              )}
            </div>

            {!isSelf && !isMemberOwner && (
              <div className="flex items-center gap-2">
                {isOwner && (
                  <select
                    value={m.role}
                    onChange={(e) => handleRoleChange(m, e.target.value)}
                    className="rounded border border-white/10 bg-surface-darkest px-2 py-1 text-xs text-white outline-none"
                  >
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                  </select>
                )}
                {isAdminOrOwner && m.role !== 'admin' && (
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
