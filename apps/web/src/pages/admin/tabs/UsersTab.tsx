import { useState } from 'react'
import type { AdminUser, UserSession } from '../adminTypes'
import { adminFetch } from '../adminApi'
import { fmtDate, fmtDateTime } from '../adminFormatters'
import { ConfirmDeleteBtn, Empty } from '../AdminShared'
import { Button, Input, Spinner, StatusDot, Textarea } from '@/components/ui'

export function UsersTab({
  users,
  setUsers
}: {
  users: AdminUser[]
  setUsers: React.Dispatch<React.SetStateAction<AdminUser[]>>
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({
    username: '',
    displayName: '',
    email: '',
    bio: ''
  })
  const [saving, setSaving] = useState(false)
  const [editError, setEditError] = useState('')

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const [sessionsUserId, setSessionsUserId] = useState<string | null>(null)
  const [sessions, setSessions] = useState<UserSession[]>([])
  const [sessionsLoading, setSessionsLoading] = useState(false)
  const [sessionsError, setSessionsError] = useState('')

  const toggleSessions = async (userId: string) => {
    if (sessionsUserId === userId) {
      setSessionsUserId(null)
      return
    }
    setSessionsUserId(userId)
    setSessionsLoading(true)
    setSessionsError('')
    try {
      const s = await adminFetch<UserSession[]>(`/api/admin/users/${userId}/sessions`)
      setSessions(s)
    } catch (e) {
      setSessionsError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setSessionsLoading(false)
    }
  }

  const revokeSession = async (userId: string, sessionId: string) => {
    try {
      await adminFetch(`/api/admin/users/${userId}/sessions/${sessionId}`, {
        method: 'DELETE'
      })
      setSessions((prev) => prev.filter((s) => s.id !== sessionId))
    } catch (e) {
      setSessionsError(e instanceof Error ? e.message : 'Failed to revoke')
    }
  }

  const revokeAllSessions = async (userId: string) => {
    try {
      await adminFetch(`/api/admin/users/${userId}/sessions`, {
        method: 'DELETE'
      })
      setSessions([])
    } catch (e) {
      setSessionsError(e instanceof Error ? e.message : 'Failed to revoke')
    }
  }

  const startEdit = (user: AdminUser) => {
    setEditingId(user.id)
    setEditForm({
      username: user.username,
      displayName: user.displayName ?? user.username,
      email: user.email,
      bio: user.bio ?? ''
    })
    setEditError('')
  }

  const handleSave = async () => {
    if (!editingId) return
    setSaving(true)
    setEditError('')
    try {
      const updated = await adminFetch<AdminUser>(`/api/admin/users/${editingId}`, {
        method: 'PATCH',
        body: {
          username: editForm.username.trim(),
          displayName: editForm.displayName.trim(),
          email: editForm.email.trim(),
          bio: editForm.bio.trim()
        }
      })
      setUsers((prev) => prev.map((u) => (u.id === editingId ? updated : u)))
      setEditingId(null)
    } catch (e) {
      setEditError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setSaving(false)
    }
  }

  const [deleteError, setDeleteError] = useState('')

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    setDeleteError('')
    try {
      await adminFetch(`/api/admin/users/${id}`, { method: 'DELETE' })
      setUsers((prev) => prev.filter((u) => u.id !== id))
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setDeletingId(null)
      setConfirmDeleteId(null)
    }
  }

  return (
    <div className="space-y-2">
      {deleteError && (
        <div className="mb-3 rounded-md bg-red-900/30 px-4 py-2 text-sm text-red-300 ring-1 ring-red-500/30">
          {deleteError}
        </div>
      )}
      {users.length === 0 ? (
        <Empty>No users registered.</Empty>
      ) : (
        users.map((user) => (
          <div key={user.id} className="rounded-lg bg-surface-dark ring-1 ring-white/10">
            <div className="flex items-center gap-4 p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary text-sm font-bold uppercase text-primary-text">
                {user.avatarUrl ? (
                  <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  user.username.charAt(0)
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate font-semibold">{user.username}</p>
                  <StatusDot status={user.status} />
                </div>
                <p className="truncate text-sm text-gray-400">{user.email}</p>
                <p className="text-xs text-gray-500">
                  {user._count.serverMemberships} server
                  {user._count.serverMemberships !== 1 && 's'} &middot; {user._count.messages} message
                  {user._count.messages !== 1 && 's'} &middot; Joined {fmtDate(user.createdAt)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void toggleSessions(user.id)}
                  className="rounded-md px-3 py-1.5 text-sm font-medium text-gray-300 transition hover:bg-white/5 hover:text-white"
                >
                  {sessionsUserId === user.id ? 'Hide Sessions' : 'Sessions'}
                </button>
                <button
                  type="button"
                  onClick={() => (editingId === user.id ? setEditingId(null) : startEdit(user))}
                  className="rounded-md px-3 py-1.5 text-sm font-medium text-gray-300 transition hover:bg-white/5 hover:text-white"
                >
                  {editingId === user.id ? 'Cancel' : 'Edit'}
                </button>
                <ConfirmDeleteBtn
                  id={user.id}
                  confirmId={confirmDeleteId}
                  deletingId={deletingId}
                  onConfirm={() => setConfirmDeleteId(user.id)}
                  onCancel={() => setConfirmDeleteId(null)}
                  onDelete={() => void handleDelete(user.id)}
                  label="Delete User"
                />
              </div>
            </div>

            {sessionsUserId === user.id && (
              <div className="border-t border-white/5 p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-semibold text-gray-300">Active Sessions ({sessions.length})</h4>
                  {sessions.length > 0 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      className="text-red-400 hover:bg-red-900/30 hover:text-red-300"
                      onClick={() => void revokeAllSessions(user.id)}
                    >
                      Revoke All
                    </Button>
                  )}
                </div>
                {sessionsLoading ? (
                  <div className="flex justify-center py-2">
                    <Spinner size="md" />
                  </div>
                ) : sessionsError ? (
                  <p className="text-sm text-red-400">{sessionsError}</p>
                ) : sessions.length === 0 ? (
                  <p className="text-sm text-gray-500">No active sessions.</p>
                ) : (
                  <div className="space-y-2">
                    {sessions.map((s) => (
                      <div
                        key={s.id}
                        className="flex items-center gap-3 rounded-md bg-surface-darkest px-3 py-2 ring-1 ring-white/5"
                      >
                        <div className="min-w-0 flex-1 text-sm">
                          <p className="truncate text-gray-300">
                            {s.userAgent
                              ? s.userAgent.length > 80
                                ? s.userAgent.slice(0, 80) + '…'
                                : s.userAgent
                              : 'Unknown device'}
                          </p>
                          <p className="text-xs text-gray-500">
                            IP: {s.ipAddress ?? 'Unknown'} &middot; Created {fmtDate(s.createdAt)}
                            {s.lastUsedAt && ` · Last used ${fmtDateTime(s.lastUsedAt)}`}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          className="shrink-0 text-red-400 hover:bg-red-900/30 hover:text-red-300"
                          onClick={() => void revokeSession(user.id, s.id)}
                        >
                          Revoke
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {editingId === user.id && (
              <div className="border-t border-white/5 p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input
                    id={`admin-user-edit-${user.id}-username`}
                    label="Username"
                    type="text"
                    value={editForm.username}
                    onChange={(e) =>
                      setEditForm((f) => ({
                        ...f,
                        username: e.target.value
                      }))
                    }
                  />
                  <Input
                    id={`admin-user-edit-${user.id}-displayName`}
                    label="Display Name"
                    type="text"
                    value={editForm.displayName}
                    onChange={(e) =>
                      setEditForm((f) => ({
                        ...f,
                        displayName: e.target.value
                      }))
                    }
                  />
                  <Input
                    id={`admin-user-edit-${user.id}-email`}
                    label="Email"
                    type="email"
                    value={editForm.email}
                    onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                  />
                </div>
                <div className="mt-3">
                  <Textarea
                    id={`admin-user-edit-${user.id}-bio`}
                    label="Bio"
                    value={editForm.bio}
                    onChange={(e) => setEditForm((f) => ({ ...f, bio: e.target.value }))}
                    rows={2}
                  />
                </div>
                {editError && <p className="mt-2 text-sm text-red-400">{editError}</p>}
                <div className="mt-3 flex justify-end">
                  <Button
                    type="button"
                    variant="primary"
                    disabled={saving || !editForm.username.trim() || !editForm.email.trim()}
                    onClick={() => void handleSave()}
                  >
                    {saving ? 'Saving…' : 'Save Changes'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  )
}
