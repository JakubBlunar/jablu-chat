import type { Role } from '@chat/shared'
import { Permission, PERMISSION_LABELS, permsToBigInt } from '@chat/shared'
import { useCallback, useEffect, useState } from 'react'
import { Button, Input } from '@/components/ui'
import { usePermissions } from '@/hooks/usePermissions'
import { api } from '@/lib/api'
import type { Server } from '@/stores/server.store'

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
