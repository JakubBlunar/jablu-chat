import type { Channel, Role } from '@chat/shared'
import { Permission, permsToBigInt, hasPermission } from '@chat/shared'
import { useCallback, useEffect, useState } from 'react'
import { ModalOverlay } from '@/components/ui/ModalOverlay'
import { Toggle } from '@/components/ui/Toggle'
import { api } from '@/lib/api'
import { useAppNavigate } from '@/hooks/useAppNavigate'
import { useChannelStore } from '@/stores/channel.store'
import { useServerStore } from '@/stores/server.store'

function normalizeChannelName(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

type OverrideState = 'inherit' | 'allow' | 'deny'

type RoleOverride = {
  roleId: string
  roleName: string
  state: OverrideState
  original: OverrideState
}

const SEND_MESSAGES = Permission.SEND_MESSAGES

function parseOverrideState(allow: string, deny: string): OverrideState {
  const a = permsToBigInt(allow)
  const d = permsToBigInt(deny)
  if (hasPermission(d, SEND_MESSAGES)) return 'deny'
  if (hasPermission(a, SEND_MESSAGES)) return 'allow'
  return 'inherit'
}

export function EditChannelModal({ channel, onClose }: { channel: Channel; onClose: () => void }) {
  const currentServerId = useServerStore((s) => s.currentServerId)
  const fetchChannels = useChannelStore((s) => s.fetchChannels)
  const categories = useChannelStore((s) => s.categories)
  const currentChannelId = useChannelStore((s) => s.currentChannelId)
  const { goToServer } = useAppNavigate()

  const [rawName, setRawName] = useState(channel.name)
  const [categoryId, setCategoryId] = useState<string | null>(channel.categoryId ?? null)
  const [isArchived, setIsArchived] = useState(channel.isArchived ?? false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [roleOverrides, setRoleOverrides] = useState<RoleOverride[]>([])
  const [permissionsLoading, setPermissionsLoading] = useState(false)
  const [permissionsSaving, setPermissionsSaving] = useState(false)
  const [showPermissions, setShowPermissions] = useState(false)

  const name = normalizeChannelName(rawName)

  const nameChanged = name !== channel.name
  const categoryChanged = categoryId !== (channel.categoryId ?? null)
  const archivedChanged = isArchived !== (channel.isArchived ?? false)
  const hasChanges = nameChanged || categoryChanged || archivedChanged

  useEffect(() => {
    if (!showPermissions || !currentServerId) return
    let cancelled = false
    setPermissionsLoading(true)

    Promise.all([
      api.getRoles(currentServerId),
      api.getChannelOverrides(channel.id)
    ]).then(([roles, overrides]) => {
      if (cancelled) return
      const overrideMap = new Map(
        (overrides as Array<{ roleId: string; allow: string; deny: string }>).map(
          (o) => [o.roleId, o] as const
        )
      )
      const items: RoleOverride[] = roles.map((r: Role) => {
        const o = overrideMap.get(r.id)
        const state = o ? parseOverrideState(o.allow, o.deny) : 'inherit'
        return { roleId: r.id, roleName: r.name, state, original: state }
      })
      setRoleOverrides(items)
      setPermissionsLoading(false)
    }).catch(() => {
      if (!cancelled) setPermissionsLoading(false)
    })

    return () => { cancelled = true }
  }, [showPermissions, currentServerId, channel.id])

  const permissionsChanged = roleOverrides.some((r) => r.state !== r.original)

  const handleSavePermissions = useCallback(async () => {
    if (!currentServerId || !permissionsChanged) return
    setPermissionsSaving(true)
    setError(null)
    try {
      const changed = roleOverrides.filter((r) => r.state !== r.original)
      for (const r of changed) {
        if (r.state === 'inherit') {
          await api.deleteChannelOverride(currentServerId, channel.id, r.roleId)
        } else {
          const allow = r.state === 'allow' ? SEND_MESSAGES.toString() : '0'
          const deny = r.state === 'deny' ? SEND_MESSAGES.toString() : '0'
          await api.upsertChannelOverride(currentServerId, channel.id, r.roleId, allow, deny)
        }
      }
      setRoleOverrides((prev) => prev.map((r) => ({ ...r, original: r.state })))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update permissions.')
    } finally {
      setPermissionsSaving(false)
    }
  }, [currentServerId, channel.id, roleOverrides, permissionsChanged])

  const handleSave = useCallback(async () => {
    if (!currentServerId || !name) return
    if (!hasChanges) {
      onClose()
      return
    }
    setSaving(true)
    setError(null)
    try {
      const patch: { name?: string; categoryId?: string | null; isArchived?: boolean } = {}
      if (nameChanged) patch.name = name
      if (categoryChanged) patch.categoryId = categoryId
      if (archivedChanged) patch.isArchived = isArchived
      await api.updateChannel(currentServerId, channel.id, patch)
      await fetchChannels(currentServerId)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update channel.')
    } finally {
      setSaving(false)
    }
  }, [currentServerId, channel, name, categoryId, isArchived, nameChanged, categoryChanged, archivedChanged, hasChanges, fetchChannels, onClose])

  const handleDelete = useCallback(async () => {
    if (!currentServerId) return
    setDeleting(true)
    setError(null)
    try {
      await api.deleteChannel(currentServerId, channel.id)
      await fetchChannels(currentServerId)
      if (currentChannelId === channel.id) {
        goToServer(currentServerId)
      }
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete channel.')
      setDeleting(false)
    }
  }, [currentServerId, channel.id, currentChannelId, goToServer, fetchChannels, onClose])

  const setRoleState = (roleId: string, state: OverrideState) => {
    setRoleOverrides((prev) =>
      prev.map((r) => (r.roleId === roleId ? { ...r, state } : r))
    )
  }

  return (
    <ModalOverlay onClose={onClose}>
      <h2 className="text-xl font-semibold text-white">Edit Channel</h2>
        <p className="mt-1 text-sm text-gray-400">
          #{channel.name} &middot; {channel.type === 'text' ? 'Text Channel' : 'Voice Channel'}
        </p>

        <label className="mt-5 block text-xs font-semibold uppercase tracking-wide text-gray-400">
          Channel name
          <input
            type="text"
            value={rawName}
            onChange={(e) => setRawName(e.target.value)}
            className="mt-1.5 w-full rounded-md border-0 bg-surface-darkest px-3 py-2.5 text-sm text-white outline-none ring-1 ring-white/10 transition placeholder:text-gray-500 focus:ring-2 focus:ring-primary"
            maxLength={100}
            autoFocus
          />
        </label>
        {name && name !== channel.name ? (
          <p className="mt-1.5 text-xs text-gray-500">
            Will be renamed to <span className="text-gray-300">#{name}</span>
          </p>
        ) : null}

        {categories.length > 0 && (
          <label className="mt-5 block text-xs font-semibold uppercase tracking-wide text-gray-400">
            Category
            <select
              value={categoryId ?? ''}
              onChange={(e) => setCategoryId(e.target.value || null)}
              className="mt-1.5 w-full rounded-md border-0 bg-surface-darkest px-3 py-2.5 text-sm text-white outline-none ring-1 ring-white/10 transition focus:ring-2 focus:ring-primary"
            >
              <option value="">No category</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </label>
        )}

        {channel.type === 'text' && (
          <div className="mt-5 flex items-center justify-between text-sm text-gray-300">
            <span>
              Archive channel
              <span className="ml-1 text-xs text-gray-500">
                (read-only, hidden from default view)
              </span>
            </span>
            <Toggle checked={isArchived} onChange={setIsArchived} />
          </div>
        )}

        {channel.type === 'text' && (
          <div className="mt-5">
            <button
              type="button"
              onClick={() => setShowPermissions((v) => !v)}
              className="flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wide text-gray-400 transition hover:text-gray-300"
            >
              <span>Channel Permissions</span>
              <svg
                className={`h-4 w-4 transition-transform ${showPermissions ? 'rotate-180' : ''}`}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>

            {showPermissions && (
              <div className="mt-3 rounded-lg bg-surface-darkest p-3">
                <p className="mb-3 text-xs text-gray-500">
                  Control which roles can send messages in this channel. Deny @everyone and allow
                  specific roles to create a read-only channel.
                </p>

                {permissionsLoading ? (
                  <div className="flex items-center gap-2 py-2 text-xs text-gray-500">
                    <div className="h-3 w-3 animate-spin rounded-full border border-gray-600 border-t-primary" />
                    Loading roles...
                  </div>
                ) : roleOverrides.length === 0 ? (
                  <p className="py-2 text-xs text-gray-500">No roles found.</p>
                ) : (
                  <div className="space-y-2">
                    <div className="grid grid-cols-[1fr_auto] items-center gap-2 px-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                      <span>Role</span>
                      <span className="w-[180px] text-center">Send Messages</span>
                    </div>
                    {roleOverrides.map((r) => (
                      <div
                        key={r.roleId}
                        className="grid grid-cols-[1fr_auto] items-center gap-2 rounded-md px-1 py-1.5 transition hover:bg-white/[0.03]"
                      >
                        <span className="truncate text-sm text-gray-300">{r.roleName}</span>
                        <div className="flex w-[180px] rounded-md bg-surface p-0.5">
                          {(['inherit', 'allow', 'deny'] as const).map((opt) => (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => setRoleState(r.roleId, opt)}
                              className={`flex-1 rounded px-2 py-1 text-[11px] font-medium capitalize transition ${
                                r.state === opt
                                  ? opt === 'allow'
                                    ? 'bg-emerald-600 text-white'
                                    : opt === 'deny'
                                      ? 'bg-red-600 text-white'
                                      : 'bg-white/10 text-white'
                                  : 'text-gray-500 hover:text-gray-300'
                              }`}
                            >
                              {opt}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {permissionsChanged && (
                  <button
                    type="button"
                    onClick={() => void handleSavePermissions()}
                    disabled={permissionsSaving}
                    className="mt-3 w-full rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white transition hover:bg-primary-hover disabled:opacity-50"
                  >
                    {permissionsSaving ? 'Saving permissions…' : 'Save Permissions'}
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {error && (
          <p className="mt-3 text-sm text-red-400" role="alert">
            {error}
          </p>
        )}

        <div className="mt-6 flex justify-between">
          <div>
            {!confirmDelete ? (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="rounded-md px-3 py-2 text-sm font-medium text-red-400 transition hover:bg-red-500/10"
              >
                Delete Channel
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-50"
                >
                  {deleting ? 'Deleting…' : 'Confirm Delete'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="rounded-md px-3 py-2 text-sm text-gray-400 hover:text-white"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-md px-4 py-2 text-sm font-medium text-gray-300 transition hover:bg-white/5 hover:text-white disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving || !name || !hasChanges}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
    </ModalOverlay>
  )
}
