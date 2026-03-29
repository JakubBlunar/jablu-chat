import { useState } from 'react'
import type { AdminInvite, AdminServer } from '../adminTypes'
import { adminFetch } from '../adminApi'
import { fmtDate } from '../adminFormatters'
import { ConfirmDeleteBtn, Empty } from '../AdminShared'

export function InvitesTab({
  invites,
  setInvites,
  servers,
  regMode
}: {
  invites: AdminInvite[]
  setInvites: React.Dispatch<React.SetStateAction<AdminInvite[]>>
  servers: AdminServer[]
  regMode: string
}) {
  const [showCreate, setShowCreate] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [newServerId, setNewServerId] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState('')

  const handleCreate = async () => {
    if (!newEmail.trim()) return
    setCreating(true)
    setCreateError('')
    try {
      const invite = await adminFetch<AdminInvite>('/api/admin/invites', {
        method: 'POST',
        body: {
          email: newEmail.trim(),
          ...(newServerId ? { serverId: newServerId } : {})
        }
      })
      setInvites((prev) => [invite, ...prev])
      setNewEmail('')
      setNewServerId('')
      setShowCreate(false)
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    setDeleteError('')
    try {
      await adminFetch(`/api/admin/invites/${id}`, { method: 'DELETE' })
      setInvites((prev) => prev.filter((i) => i.id !== id))
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setDeletingId(null)
      setConfirmDeleteId(null)
    }
  }

  return (
    <>
      <div
        className={`mb-4 rounded-md px-4 py-3 text-sm ring-1 ${
          regMode === 'invite'
            ? 'bg-emerald-900/20 text-emerald-300 ring-emerald-500/30'
            : 'bg-amber-900/20 text-amber-300 ring-amber-500/30'
        }`}
      >
        Registration mode: <strong className="font-semibold">{regMode}</strong>
        {regMode === 'open' && (
          <span className="ml-1 text-amber-400/80">
            — Anyone can register without an invite code. Set{' '}
            <code className="rounded bg-black/30 px-1 py-0.5 text-xs">REGISTRATION_MODE=invite</code> in your{' '}
            <code className="rounded bg-black/30 px-1 py-0.5 text-xs">.env</code> to require invites.
          </span>
        )}
        {regMode === 'invite' && (
          <span className="ml-1 text-emerald-400/80">— Only users with a valid invite code can register.</span>
        )}
      </div>

      {deleteError && (
        <div className="mb-3 rounded-md bg-red-900/30 px-4 py-2 text-sm text-red-300 ring-1 ring-red-500/30">
          {deleteError}
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setShowCreate(!showCreate)}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium transition hover:bg-primary-hover"
        >
          {showCreate ? 'Cancel' : 'Create Invite'}
        </button>
      </div>

      {showCreate && (
        <div className="mt-4 rounded-lg bg-surface-dark p-5 ring-1 ring-white/10">
          <h2 className="text-lg font-semibold">Create Registration Invite</h2>
          <p className="mt-1 text-sm text-gray-400">
            The invite code will be tied to the email address. The user must register with this exact email.
          </p>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="user@example.com"
              className="flex-1 rounded-md bg-surface-darkest px-3 py-2 text-sm outline-none ring-1 ring-white/10 placeholder:text-gray-500 focus:ring-2 focus:ring-primary"
            />
            <select
              value={newServerId}
              onChange={(e) => setNewServerId(e.target.value)}
              className="rounded-md bg-surface-darkest px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-primary"
            >
              <option value="">No auto-join server</option>
              {servers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void handleCreate()}
              disabled={creating || !newEmail.trim()}
              className="rounded-md bg-success px-4 py-2 text-sm font-medium text-white transition hover:bg-success-hover disabled:opacity-50"
            >
              {creating ? 'Creating…' : 'Create'}
            </button>
          </div>
          {createError && <p className="mt-2 text-sm text-red-400">{createError}</p>}
        </div>
      )}

      <div className="mt-4 space-y-2">
        {invites.length === 0 ? (
          <Empty>No invites created yet.</Empty>
        ) : (
          invites.map((invite) => (
            <div
              key={invite.id}
              className="flex items-center gap-4 rounded-lg bg-surface-dark p-4 ring-1 ring-white/10"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-3">
                  <code className="rounded bg-surface-darkest px-2.5 py-1 font-mono text-sm font-semibold tracking-widest text-white">
                    {invite.code}
                  </code>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      invite.used ? 'bg-gray-600/30 text-gray-400' : 'bg-emerald-600/20 text-emerald-400'
                    }`}
                  >
                    {invite.used ? 'Used' : 'Available'}
                  </span>
                </div>
                <p className="mt-1.5 text-sm text-gray-400">
                  Email: <span className="text-gray-300">{invite.email}</span>
                  {invite.server && (
                    <>
                      {' '}
                      &middot; Auto-join: <span className="text-gray-300">{invite.server.name}</span>
                    </>
                  )}
                </p>
                <p className="text-xs text-gray-500">
                  Created {fmtDate(invite.createdAt)}
                  {invite.used && invite.usedBy && (
                    <>
                      {' '}
                      &middot; Used by <span className="text-gray-400">{invite.usedBy.username}</span> on{' '}
                      {fmtDate(invite.usedAt!)}
                    </>
                  )}
                </p>
              </div>
              {!invite.used && (
                <ConfirmDeleteBtn
                  id={invite.id}
                  confirmId={confirmDeleteId}
                  deletingId={deletingId}
                  onConfirm={() => setConfirmDeleteId(invite.id)}
                  onCancel={() => setConfirmDeleteId(null)}
                  onDelete={() => void handleDelete(invite.id)}
                  label="Revoke"
                />
              )}
            </div>
          ))
        )}
      </div>
    </>
  )
}
