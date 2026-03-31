import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Permission, PERMISSION_LABELS, permsToBigInt } from '@chat/shared'
import type { AdminServer, AdminUser, AdminRole, ServerMemberRow } from '../adminTypes'
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
  const [expandedPanel, setExpandedPanel] = useState<'members' | 'roles'>('members')

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
                  onClick={() => {
                    setExpandedPanel('members')
                    setExpandedId(expandedId === server.id ? null : server.id)
                  }}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition hover:bg-white/5 hover:text-white ${
                    expandedId === server.id && expandedPanel === 'members' ? 'text-white bg-white/5' : 'text-gray-400'
                  }`}
                >
                  Members
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setExpandedPanel('roles')
                    setExpandedId(expandedId === server.id ? null : server.id)
                  }}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition hover:bg-white/5 hover:text-white ${
                    expandedId === server.id && expandedPanel === 'roles' ? 'text-white bg-white/5' : 'text-gray-400'
                  }`}
                >
                  Roles
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
              {expandedId === server.id && expandedPanel === 'members' && (
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
              {expandedId === server.id && expandedPanel === 'roles' && (
                <ServerRolesPanel server={server} />
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
      const [membersData, rolesData] = await Promise.all([
        adminFetch<ServerMemberRow[]>(`/api/admin/servers/${server.id}/members`),
        adminFetch<{ id: string; name: string; color: string | null; isDefault: boolean }[]>(`/api/admin/servers/${server.id}/roles`)
      ])
      const normalized = membersData.map((m) => ({
        ...m,
        roleIds: m.roles?.map((r) => r.role.id) ?? [],
      }))
      setMembers(normalized)
      setRoles(rolesData)
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

  const handleRoleToggle = async (userId: string, roleId: string) => {
    setUpdatingRoleId(userId)
    setError('')
    const member = members.find((m) => m.userId === userId)
    if (!member) return
    const currentIds = new Set(member.roleIds ?? [])
    if (currentIds.has(roleId)) currentIds.delete(roleId)
    else currentIds.add(roleId)
    try {
      const result = await adminFetch<{
        members: ServerMemberRow[]
        owner: { id: string; username: string }
        ownerId: string
      }>(`/api/admin/servers/${server.id}/members/${userId}/roles`, { method: 'PATCH', body: { roleIds: Array.from(currentIds) } })
      const normalized = result.members.map((m) => ({
        ...m,
        roleIds: m.roles?.map((r) => r.role.id) ?? [],
      }))
      setMembers(normalized)
      if (result.owner) onServerUpdate({ ownerId: result.ownerId, owner: result.owner })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update roles')
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
              <div className="flex flex-wrap gap-1">
                {roles.filter((r) => !r.isDefault).map((r) => {
                  const isActive = m.roleIds?.includes(r.id) ?? false
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => void handleRoleToggle(m.userId, r.id)}
                      disabled={updatingRoleId === m.userId}
                      className={`rounded border px-2 py-0.5 text-[10px] font-medium transition disabled:opacity-50 ${
                        isActive ? 'border-primary bg-primary/20 text-white' : 'border-white/10 text-gray-400 hover:bg-white/5'
                      }`}
                    >
                      {r.name}
                    </button>
                  )
                })}
              </div>
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

function GripIcon() {
  return (
    <svg className="h-3.5 w-3.5 text-gray-600" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="9" cy="5" r="1.5" /><circle cx="15" cy="5" r="1.5" />
      <circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" />
      <circle cx="9" cy="19" r="1.5" /><circle cx="15" cy="19" r="1.5" />
    </svg>
  )
}

function SortableAdminRoleItem({ role, isSelected, onClick }: {
  role: AdminRole
  isSelected: boolean
  onClick: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: role.id })
  const style = { transform: CSS.Transform.toString(transform), transition }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-1.5 rounded-md text-left text-sm transition ${
        isSelected ? 'bg-primary/20 text-white' : 'text-gray-300 hover:bg-white/[0.04]'
      } ${isDragging ? 'z-50 opacity-75 shadow-lg' : ''}`}
    >
      <button type="button" className="cursor-grab touch-none px-1 py-2 active:cursor-grabbing" {...attributes} {...listeners}>
        <GripIcon />
      </button>
      <button
        type="button"
        onClick={onClick}
        className="flex min-w-0 flex-1 items-center gap-2 py-2 pr-3"
      >
        <span className="inline-block h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: role.color ?? '#99aab5' }} />
        <span className="truncate">{role.name}</span>
      </button>
    </div>
  )
}

function ServerRolesPanel({ server }: { server: AdminServer }) {
  const [roles, setRoles] = useState<AdminRole[]>([])
  const [selected, setSelected] = useState<AdminRole | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState('#99aab5')
  const [editPerms, setEditPerms] = useState(0n)
  const [editSelfAssignable, setEditSelfAssignable] = useState(false)
  const [editIsAdmin, setEditIsAdmin] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const fetchRoles = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await adminFetch<AdminRole[]>(`/api/admin/servers/${server.id}/roles`)
      setRoles(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load roles')
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
      setEditSelfAssignable(selected.selfAssignable ?? false)
      setEditIsAdmin(selected.isAdmin ?? false)
    }
  }, [selected])

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = roles.findIndex((r) => r.id === active.id)
    const newIndex = roles.findIndex((r) => r.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    const reordered = arrayMove(roles, oldIndex, newIndex)
    setRoles(reordered)
    try {
      await adminFetch(`/api/admin/servers/${server.id}/roles/reorder`, {
        method: 'PATCH',
        body: { roleIds: reordered.map((r) => r.id) }
      })
    } catch {
      setError('Failed to reorder roles')
      void fetchRoles()
    }
  }

  const handleCreate = async () => {
    setError('')
    try {
      await adminFetch<AdminRole>(`/api/admin/servers/${server.id}/roles`, {
        method: 'POST',
        body: { name: 'New Role' }
      })
      await fetchRoles()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create role')
    }
  }

  const handleSave = async () => {
    if (!selected) return
    setSaving(true)
    setError('')
    try {
      const updated = await adminFetch<AdminRole>(`/api/admin/servers/${server.id}/roles/${selected.id}`, {
        method: 'PATCH',
        body: {
          name: editName,
          color: editColor,
          permissions: editPerms.toString(),
          selfAssignable: editSelfAssignable,
          isAdmin: editIsAdmin
        }
      })
      setRoles((prev) => prev.map((r) => (r.id === updated.id ? updated : r)))
      setSelected(updated)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save role')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!selected || selected.isDefault) return
    if (!confirm(`Delete role "${selected.name}"? Members with this role will lose it.`)) return
    setError('')
    try {
      await adminFetch(`/api/admin/servers/${server.id}/roles/${selected.id}`, { method: 'DELETE' })
      setRoles((prev) => prev.filter((r) => r.id !== selected.id))
      setSelected(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete role')
    }
  }

  const togglePerm = (flag: bigint) => {
    setEditPerms((prev) => (prev & flag) === flag ? prev & ~flag : prev | flag)
  }

  if (loading) return <div className="border-t border-white/5 px-4 py-4"><p className="text-center text-sm text-gray-500">Loading roles…</p></div>

  const draggableRoles = roles.filter((r) => !r.isDefault)
  const everyoneRole = roles.find((r) => r.isDefault)

  return (
    <div className="border-t border-white/5 px-4 pb-4 pt-3">
      {error && (
        <div className="mb-3 rounded-md bg-red-900/30 px-3 py-2 text-sm text-red-300 ring-1 ring-red-500/30">
          {error}
        </div>
      )}

      <div className="flex gap-4">
        <div className="w-48 shrink-0 space-y-1">
          {draggableRoles.length > 1 ? (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => void handleDragEnd(e)}>
              <SortableContext items={draggableRoles.map((r) => r.id)} strategy={verticalListSortingStrategy}>
                {draggableRoles.map((r) => (
                  <SortableAdminRoleItem
                    key={r.id}
                    role={r}
                    isSelected={selected?.id === r.id}
                    onClick={() => setSelected(r)}
                  />
                ))}
              </SortableContext>
            </DndContext>
          ) : (
            draggableRoles.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setSelected(r)}
                className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition ${
                  selected?.id === r.id ? 'bg-primary/20 text-white' : 'text-gray-300 hover:bg-white/[0.04]'
                }`}
              >
                <span className="inline-block h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: r.color ?? '#99aab5' }} />
                <span className="truncate">{r.name}</span>
              </button>
            ))
          )}

          {everyoneRole && (
            <button
              type="button"
              onClick={() => setSelected(everyoneRole)}
              className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition ${
                selected?.id === everyoneRole.id ? 'bg-primary/20 text-white' : 'text-gray-300 hover:bg-white/[0.04]'
              }`}
            >
              <span className="inline-block h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: '#99aab5' }} />
              <span className="truncate">{everyoneRole.name}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => void handleCreate()}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-gray-400 transition hover:bg-white/[0.04] hover:text-white"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M12 4v16m8-8H4" /></svg>
            Create Role
          </button>

          {draggableRoles.length > 1 && (
            <p className="px-2 pt-1 text-[10px] text-gray-600">Drag to reorder hierarchy</p>
          )}
        </div>

        <div className="min-w-0 flex-1">
          {!selected ? (
            <p className="py-8 text-center text-sm text-gray-500">Select a role to edit</p>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <Input
                    id="admin-role-name"
                    label="Role Name"
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    disabled={selected.isDefault}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-400">Color</label>
                  <input
                    type="color"
                    value={editColor}
                    onChange={(e) => setEditColor(e.target.value)}
                    className="h-9 w-14 cursor-pointer rounded-md border border-white/10 bg-surface-darkest"
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
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={(editPerms & flag) === flag}
                        onChange={() => togglePerm(flag)}
                        className="accent-primary"
                      />
                      {PERMISSION_LABELS[key] ?? key}
                    </label>
                  ))}
                </div>
              </div>

              {!selected.isDefault && (
                <div className="space-y-3 border-t border-white/5 pt-4">
                  <label className={`flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm transition hover:bg-white/[0.04] ${editSelfAssignable ? 'text-white' : 'text-gray-400'}`}>
                    <input type="checkbox" checked={editSelfAssignable} onChange={(e) => setEditSelfAssignable(e.target.checked)} className="accent-primary" />
                    Self-assignable
                  </label>
                  <label className={`flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm transition hover:bg-white/[0.04] ${editIsAdmin ? 'text-white' : 'text-gray-400'}`}>
                    <input type="checkbox" checked={editIsAdmin} onChange={(e) => setEditIsAdmin(e.target.checked)} className="accent-primary" />
                    Admin role
                  </label>
                </div>
              )}

              <div className="flex items-center gap-2 border-t border-white/5 pt-4">
                <Button type="button" onClick={() => void handleSave()} loading={saving}>
                  Save Changes
                </Button>
                {!selected.isDefault && (
                  <Button type="button" variant="danger" onClick={() => void handleDelete()}>
                    Delete Role
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
