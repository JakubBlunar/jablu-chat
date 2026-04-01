import { useCallback, useEffect, useState } from 'react'
import { ModalOverlay } from '@/components/ui/ModalOverlay'
import { Button, ColorDot } from '@/components/ui'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth.store'
import { useMemberStore } from '@/stores/member.store'
import { useServerStore } from '@/stores/server.store'

type AvailableRole = { id: string; name: string; color: string | null }

export function RolePickerModal({ onClose }: { onClose: () => void }) {
  const userId = useAuthStore((s) => s.user?.id)
  const serverId = useServerStore((s) => s.currentServerId)
  const myMember = useMemberStore((s) =>
    s.members.find((m) => m.userId === userId && m.serverId === serverId)
  )

  const [availableRoles, setAvailableRoles] = useState<AvailableRole[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const myRoles = (myMember?.roles ?? []).filter((r) => !r.isDefault)

  const fetchRoles = useCallback(async () => {
    if (!serverId) return
    setLoading(true)
    setError('')
    try {
      const roles = await api.getSelfAssignableRoles(serverId)
      setAvailableRoles(roles)
      const currentSelfIds = new Set(
        myRoles.filter((r) => r.selfAssignable).map((r) => r.id)
      )
      setSelectedIds(currentSelfIds)
    } catch {
      setError('Failed to load roles')
    } finally {
      setLoading(false)
    }
  }, [serverId])

  useEffect(() => { void fetchRoles() }, [fetchRoles])

  const toggleRole = (roleId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(roleId)) next.delete(roleId)
      else next.add(roleId)
      return next
    })
  }

  const handleSave = async () => {
    if (!serverId) return
    setSaving(true)
    setError('')
    try {
      await api.changeSelfRoles(serverId, Array.from(selectedIds))
      await useMemberStore.getState().fetchMembers(serverId)
      onClose()
    } catch {
      setError('Failed to save roles')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalOverlay onClose={onClose} maxWidth="max-w-sm">
      <h2 className="mb-1 text-lg font-semibold text-white">Change Your Roles</h2>
      <p className="mb-4 text-sm text-gray-400">Pick the roles you want to have on this server.</p>

      {error && (
        <div className="mb-3 rounded-md bg-red-900/30 px-3 py-2 text-sm text-red-300 ring-1 ring-red-500/30">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-600 border-t-primary" />
        </div>
      ) : availableRoles.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-500">
          No self-assignable roles are available on this server.
        </p>
      ) : (
        <div className="mb-4 max-h-64 space-y-1 overflow-y-auto">
          {availableRoles.map((role) => {
            const checked = selectedIds.has(role.id)
            return (
              <button
                key={role.id}
                type="button"
                disabled={saving}
                onClick={() => toggleRole(role.id)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition hover:bg-white/5 disabled:opacity-50 ${
                  checked ? 'bg-primary/10 text-white' : 'text-gray-300'
                }`}
              >
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition ${
                  checked ? 'border-primary bg-primary' : 'border-gray-600'
                }`}>
                  {checked && (
                    <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </span>
                <ColorDot color={role.color} />
                <span className="truncate font-medium">{role.name}</span>
              </button>
            )
          })}
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
        {availableRoles.length > 0 && (
          <Button type="button" onClick={() => void handleSave()} loading={saving}>
            Save
          </Button>
        )}
      </div>
    </ModalOverlay>
  )
}
