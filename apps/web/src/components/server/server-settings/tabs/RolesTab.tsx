import type { Role } from '@chat/shared'
import { Permission, PERMISSION_LABELS, permsToBigInt } from '@chat/shared'
import { useCallback, useEffect, useState } from 'react'
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
import { Button, Input } from '@/components/ui'
import { usePermissions } from '@/hooks/usePermissions'
import { api } from '@/lib/api'
import type { Server } from '@/stores/server.store'

function GripIcon() {
  return (
    <svg className="h-3.5 w-3.5 text-gray-600" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="9" cy="5" r="1.5" /><circle cx="15" cy="5" r="1.5" />
      <circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" />
      <circle cx="9" cy="19" r="1.5" /><circle cx="15" cy="19" r="1.5" />
    </svg>
  )
}

function SortableRoleItem({ role, isSelected, onClick, isDraggable }: {
  role: Role
  isSelected: boolean
  onClick: () => void
  isDraggable: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: role.id,
    disabled: !isDraggable
  })
  const style = { transform: CSS.Transform.toString(transform), transition }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-1.5 rounded-md text-left text-sm transition ${
        isSelected ? 'bg-primary/20 text-white' : 'text-gray-300 hover:bg-white/[0.04]'
      } ${isDragging ? 'z-50 opacity-75 shadow-lg' : ''}`}
    >
      {isDraggable && (
        <button type="button" className="cursor-grab touch-none px-1 py-2 active:cursor-grabbing" {...attributes} {...listeners}>
          <GripIcon />
        </button>
      )}
      <button
        type="button"
        onClick={onClick}
        className={`flex min-w-0 flex-1 items-center gap-2 py-2 ${isDraggable ? 'pr-3' : 'px-3'}`}
      >
        <span className="inline-block h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: role.color ?? '#99aab5' }} />
        <span className="truncate">{role.name}</span>
      </button>
    </div>
  )
}

export function RolesTab({ server }: { server: Server }) {
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
  const [editSelfAssignable, setEditSelfAssignable] = useState(false)
  const [editIsAdmin, setEditIsAdmin] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

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
      await api.reorderRoles(server.id, reordered.map((r) => r.id))
    } catch {
      setError('Failed to reorder roles')
      void fetchRoles()
    }
  }

  const handleCreate = async () => {
    setError(null)
    try {
      const role = await api.createRole(server.id, { name: 'New Role', permissions: '0', color: '#99aab5' })
      await fetchRoles()
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
        permissions: editPerms.toString(),
        selfAssignable: editSelfAssignable,
        isAdmin: editIsAdmin
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
    if (!confirm(`Delete role "${selected.name}"? Members with this role will lose it.`)) return
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

  const draggableRoles = roles.filter((r) => !r.isDefault)
  const everyoneRole = roles.find((r) => r.isDefault)

  return (
    <div className="flex gap-4">
      <div className="w-48 shrink-0 space-y-1">
        {canManage && draggableRoles.length > 1 ? (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => void handleDragEnd(e)}>
            <SortableContext items={draggableRoles.map((r) => r.id)} strategy={verticalListSortingStrategy}>
              {draggableRoles.map((r) => (
                <SortableRoleItem
                  key={r.id}
                  role={r}
                  isSelected={selected?.id === r.id}
                  onClick={() => setSelected(r)}
                  isDraggable={canManage}
                />
              ))}
            </SortableContext>
          </DndContext>
        ) : (
          draggableRoles.map((r) => (
            <SortableRoleItem
              key={r.id}
              role={r}
              isSelected={selected?.id === r.id}
              onClick={() => setSelected(r)}
              isDraggable={false}
            />
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

        {canManage && draggableRoles.length > 1 && (
          <p className="px-2 pt-1 text-[10px] text-gray-600">Drag to reorder hierarchy</p>
        )}
      </div>

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
                <Input
                  id="role-edit-name"
                  label="Role Name"
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  disabled={!canManage || selected.isDefault}
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

            {!selected.isDefault && (
              <div className="border-t border-white/5 pt-4 space-y-3">
                <div>
                  <label
                    className={`flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm transition hover:bg-white/[0.04] ${
                      editSelfAssignable ? 'text-white' : 'text-gray-400'
                    } ${!canManage ? 'pointer-events-none opacity-50' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={editSelfAssignable}
                      onChange={(e) => setEditSelfAssignable(e.target.checked)}
                      disabled={!canManage}
                      className="accent-primary"
                    />
                    Self-assignable
                  </label>
                  <p className="mt-0.5 px-3 text-[11px] text-gray-500">
                    Members can pick this role during onboarding or change to it later
                  </p>
                </div>
                <div>
                  <label
                    className={`flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm transition hover:bg-white/[0.04] ${
                      editIsAdmin ? 'text-white' : 'text-gray-400'
                    } ${!canManage ? 'pointer-events-none opacity-50' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={editIsAdmin}
                      onChange={(e) => setEditIsAdmin(e.target.checked)}
                      disabled={!canManage}
                      className="accent-primary"
                    />
                    Admin role
                  </label>
                  <p className="mt-0.5 px-3 text-[11px] text-gray-500">
                    Shows a shield icon next to members with this role in the member list
                  </p>
                </div>
              </div>
            )}

            {canManage && (
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
            )}
          </div>
        )}
      </div>
    </div>
  )
}
