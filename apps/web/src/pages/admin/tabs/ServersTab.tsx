import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AdminServer, AdminUser, ServerMemberRow } from '../adminTypes'
import { adminFetch } from '../adminApi'
import { fmtDate } from '../adminFormatters'
import { ConfirmDeleteBtn, Empty } from '../AdminShared'
import { Button, Input } from '@/components/ui'

export function ServersTab({
  servers,
  setServers,
  users
}: {
  servers: AdminServer[]
  setServers: React.Dispatch<React.SetStateAction<AdminServer[]>>
  users: AdminUser[]
}) {
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newOwnerId, setNewOwnerId] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const [expandedId, setExpandedId] = useState<string | null>(null)

  const handleCreate = async () => {
    if (!newName.trim() || !newOwnerId) return
    setCreating(true)
    setCreateError('')
    try {
      const server = await adminFetch<AdminServer>('/api/admin/servers', {
        method: 'POST',
        body: { name: newName.trim(), ownerUserId: newOwnerId }
      })
      setServers((prev) => [server, ...prev])
      setNewName('')
      setNewOwnerId('')
      setShowCreate(false)
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setCreating(false)
    }
  }

  const [deleteError, setDeleteError] = useState('')

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    setDeleteError('')
    try {
      await adminFetch(`/api/admin/servers/${id}`, { method: 'DELETE' })
      setServers((prev) => prev.filter((s) => s.id !== id))
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setDeletingId(null)
      setConfirmDeleteId(null)
    }
  }

  return (
    <>
      {deleteError && (
        <div className="mb-3 rounded-md bg-red-900/30 px-4 py-2 text-sm text-red-300 ring-1 ring-red-500/30">
          {deleteError}
        </div>
      )}
      <div className="flex justify-end">
        <Button type="button" variant="primary" onClick={() => setShowCreate(!showCreate)}>
          {showCreate ? 'Cancel' : 'Create Server'}
        </Button>
      </div>

      {showCreate && (
        <div className="mt-4 rounded-lg bg-surface-dark p-5 ring-1 ring-white/10">
          <h2 className="text-lg font-semibold">Create New Server</h2>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <Input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Server name"
                className="py-2"
              />
            </div>
            <select
              value={newOwnerId}
              onChange={(e) => setNewOwnerId(e.target.value)}
              className="rounded-md bg-surface-darkest px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-primary"
            >
              <option value="">Select owner…</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.username} ({u.email})
                </option>
              ))}
            </select>
            <Button
              type="button"
              variant="primary"
              className="shrink-0 bg-success text-white hover:bg-success-hover"
              disabled={creating || !newName.trim() || !newOwnerId}
              onClick={() => void handleCreate()}
            >
              {creating ? 'Creating…' : 'Create'}
            </Button>
          </div>
          {createError && <p className="mt-2 text-sm text-red-400">{createError}</p>}
        </div>
      )}

      <div className="mt-4 space-y-2">
        {servers.length === 0 ? (
          <Empty>No servers yet.</Empty>
        ) : (
          servers.map((server) => (
            <div key={server.id} className="rounded-lg bg-surface-dark ring-1 ring-white/10">
              <div className="flex items-center gap-4 p-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-surface text-lg font-semibold">
                  {server.iconUrl ? (
                    <img src={server.iconUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    server.name.charAt(0).toUpperCase()
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{server.name}</p>
                  <p className="text-sm text-gray-400">
                    Owner: {server.owner.username} &middot; {server._count.members} member
                    {server._count.members !== 1 && 's'} &middot; {server._count.channels} channel
                    {server._count.channels !== 1 && 's'}
                  </p>
                  <p className="text-xs text-gray-500">Created {fmtDate(server.createdAt)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setExpandedId(expandedId === server.id ? null : server.id)}
                  className="rounded-md px-3 py-1.5 text-sm font-medium text-gray-400 transition hover:bg-white/5 hover:text-white"
                >
                  Members
                </button>
                <ConfirmDeleteBtn
                  id={server.id}
                  confirmId={confirmDeleteId}
                  deletingId={deletingId}
                  onConfirm={() => setConfirmDeleteId(server.id)}
                  onCancel={() => setConfirmDeleteId(null)}
                  onDelete={() => void handleDelete(server.id)}
                />
              </div>
              {expandedId === server.id && (
                <ServerMembersPanel
                  server={server}
                  users={users}
                  onMemberCountChange={(delta) =>
                    setServers((prev) =>
                      prev.map((s) =>
                        s.id === server.id ? { ...s, _count: { ...s._count, members: s._count.members + delta } } : s
                      )
                    )
                  }
                  onServerUpdate={(patch) =>
                    setServers((prev) => prev.map((s) => (s.id === server.id ? { ...s, ...patch } : s)))
                  }
                />
              )}
            </div>
          ))
        )}
      </div>
    </>
  )
}

function ServerMembersPanel({
  server,
  users,
  onMemberCountChange,
  onServerUpdate
}: {
  server: AdminServer
  users: AdminUser[]
  onMemberCountChange: (delta: number) => void
  onServerUpdate: (patch: Partial<AdminServer>) => void
}) {
  const [members, setMembers] = useState<ServerMemberRow[]>([])
  const [roles, setRoles] = useState<{ id: string; name: string; color: string | null; isDefault: boolean }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [addUserId, setAddUserId] = useState('')
  const [adding, setAdding] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [updatingRoleId, setUpdatingRoleId] = useState<string | null>(null)

  const fetchMembers = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await adminFetch<ServerMemberRow[]>(`/api/admin/servers/${server.id}/members`)
      setMembers(data)
      const uniqueRoles = new Map<string, { id: string; name: string; color: string | null; isDefault: boolean }>()
      for (const m of data) {
        if (m.role && !uniqueRoles.has(m.role.id)) {
          uniqueRoles.set(m.role.id, { id: m.role.id, name: m.role.name, color: m.role.color, isDefault: m.role.isDefault })
        }
      }
      setRoles(Array.from(uniqueRoles.values()))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load members')
    } finally {
      setLoading(false)
    }
  }, [server.id])

  useEffect(() => {
    void fetchMembers()
  }, [fetchMembers])

  const nonMembers = useMemo(() => {
    const ids = new Set(members.map((m) => m.userId))
    return users.filter((u) => !ids.has(u.id))
  }, [members, users])

  const handleAdd = async () => {
    if (!addUserId) return
    setAdding(true)
    setError('')
    try {
      const member = await adminFetch<ServerMemberRow>(`/api/admin/servers/${server.id}/members`, {
        method: 'POST',
        body: { userId: addUserId }
      })
      setMembers((prev) => [...prev, member])
      setAddUserId('')
      onMemberCountChange(1)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add member')
    } finally {
      setAdding(false)
    }
  }

  const handleRemove = async (userId: string) => {
    setRemovingId(userId)
    setError('')
    try {
      await adminFetch(`/api/admin/servers/${server.id}/members/${userId}`, {
        method: 'DELETE'
      })
      setMembers((prev) => prev.filter((m) => m.userId !== userId))
      onMemberCountChange(-1)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove member')
    } finally {
      setRemovingId(null)
    }
  }

  const handleRoleChange = async (userId: string, roleId: string) => {
    setUpdatingRoleId(userId)
    setError('')
    try {
      const result = await adminFetch<{
        members: ServerMemberRow[]
        owner: { id: string; username: string }
        ownerId: string
      }>(`/api/admin/servers/${server.id}/members/${userId}/role`, { method: 'PATCH', body: { roleId } })
      setMembers(result.members)
      if (result.owner) onServerUpdate({ ownerId: result.ownerId, owner: result.owner })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update role')
    } finally {
      setUpdatingRoleId(null)
    }
  }

  return (
    <div className="border-t border-white/5 px-4 pb-4 pt-3">
      {error && (
        <div className="mb-3 rounded-md bg-red-900/30 px-3 py-2 text-sm text-red-300 ring-1 ring-red-500/30">
          {error}
        </div>
      )}

      <div className="mb-3 flex items-center gap-2">
        <select
          value={addUserId}
          onChange={(e) => setAddUserId(e.target.value)}
          className="min-w-0 flex-1 rounded-md bg-surface-darkest px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-primary"
        >
          <option value="">Add a user…</option>
          {nonMembers.map((u) => (
            <option key={u.id} value={u.id}>
              {u.username} ({u.email})
            </option>
          ))}
        </select>
        <Button
          type="button"
          variant="primary"
          disabled={adding || !addUserId}
          onClick={() => void handleAdd()}
        >
          {adding ? 'Adding…' : 'Add'}
        </Button>
      </div>

      {loading ? (
        <p className="py-4 text-center text-sm text-gray-500">Loading members…</p>
      ) : members.length === 0 ? (
        <p className="py-4 text-center text-sm text-gray-500">No members.</p>
      ) : (
        <div className="space-y-1">
          {members.map((m) => (
            <div
              key={m.userId}
              className="flex items-center gap-3 rounded-md px-3 py-2 transition hover:bg-white/[0.03]"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface text-xs font-semibold uppercase">
                {m.user.avatarUrl ? (
                  <img src={m.user.avatarUrl} alt="" className="h-full w-full rounded-full object-cover" />
                ) : (
                  m.user.username.charAt(0)
                )}
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-sm font-medium text-white">{m.user.username}</span>
                <span className="ml-2 text-xs text-gray-500">{m.user.email}</span>
              </div>
              <select
                value={m.roleId}
                onChange={(e) => void handleRoleChange(m.userId, e.target.value)}
                disabled={updatingRoleId === m.userId}
                className="rounded-md bg-white/5 px-2 py-1 text-xs font-semibold outline-none disabled:opacity-50"
                style={m.role?.color ? { color: m.role.color } : { color: '#9ca3af' }}
              >
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
              {m.userId !== server.ownerId && (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  className="text-red-400 hover:bg-red-500/10"
                  disabled={removingId === m.userId}
                  onClick={() => void handleRemove(m.userId)}
                >
                  {removingId === m.userId ? 'Removing…' : 'Remove'}
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
