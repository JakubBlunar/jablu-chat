import type { Invite } from '@chat/shared'
import { useCallback, useEffect, useRef, useState } from 'react'
import SimpleBar from 'simplebar-react'
import { api } from '@/lib/api'

interface InviteModalProps {
  serverId: string
  serverName: string
  onClose: () => void
}

export function InviteModal({ serverId, serverName, onClose }: InviteModalProps) {
  const [invites, setInvites] = useState<Invite[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [maxUses, setMaxUses] = useState<string>('')
  const [expiresIn, setExpiresIn] = useState<string>('1440')
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const fetchInvites = useCallback(async () => {
    try {
      const data = await api.getInvites(serverId)
      setInvites(data)
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }, [serverId])

  useEffect(() => {
    void fetchInvites()
  }, [fetchInvites])

  async function handleCreate() {
    setCreating(true)
    try {
      const invite = await api.createInvite(serverId, {
        maxUses: maxUses ? parseInt(maxUses, 10) : undefined,
        expiresInMinutes: expiresIn ? parseInt(expiresIn, 10) : undefined
      })
      setInvites((prev) => [invite, ...prev])
    } catch {
      /* ignore */
    } finally {
      setCreating(false)
    }
  }

  async function handleDelete(id: string) {
    try {
      await api.deleteInvite(id)
      setInvites((prev) => prev.filter((i) => i.id !== id))
    } catch {
      /* ignore */
    }
  }

  function copyCode(code: string, id: string) {
    void navigator.clipboard.writeText(code)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    dialogRef.current?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Invite to ${serverName}`}
        tabIndex={-1}
        className="w-full max-w-lg rounded-lg bg-surface p-6 shadow-xl outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Invite to {serverName}</h2>
          <button type="button" onClick={onClose} className="text-gray-400 transition hover:text-white">
            <XIcon />
          </button>
        </div>

        <div className="mb-4 flex gap-2">
          <select
            value={expiresIn}
            onChange={(e) => setExpiresIn(e.target.value)}
            className="rounded bg-surface-darkest px-3 py-2 text-sm text-gray-200 outline-none"
          >
            <option value="">Never expires</option>
            <option value="30">30 minutes</option>
            <option value="60">1 hour</option>
            <option value="360">6 hours</option>
            <option value="720">12 hours</option>
            <option value="1440">24 hours</option>
            <option value="10080">7 days</option>
          </select>
          <select
            value={maxUses}
            onChange={(e) => setMaxUses(e.target.value)}
            className="rounded bg-surface-darkest px-3 py-2 text-sm text-gray-200 outline-none"
          >
            <option value="">No limit</option>
            <option value="1">1 use</option>
            <option value="5">5 uses</option>
            <option value="10">10 uses</option>
            <option value="25">25 uses</option>
            <option value="50">50 uses</option>
            <option value="100">100 uses</option>
          </select>
          <button
            type="button"
            disabled={creating}
            onClick={() => void handleCreate()}
            className="rounded bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover disabled:opacity-50"
          >
            {creating ? 'Creating...' : 'Generate'}
          </button>
        </div>

        <SimpleBar className="max-h-64 space-y-2">
          {loading ? (
            <p className="py-4 text-center text-sm text-gray-400">Loading...</p>
          ) : invites.length === 0 ? (
            <p className="py-4 text-center text-sm text-gray-400">No invites yet. Create one above.</p>
          ) : (
            invites.map((inv) => (
              <div key={inv.id} className="flex items-center gap-3 rounded bg-surface-dark px-3 py-2">
                <code className="flex-1 truncate text-sm font-medium text-white">{inv.code}</code>
                <span className="text-xs text-gray-400">
                  {inv.useCount}
                  {inv.maxUses != null ? `/${inv.maxUses}` : ''} uses
                  {inv.expiresAt ? <> &middot; expires {new Date(inv.expiresAt).toLocaleDateString()}</> : null}
                </span>
                <button
                  type="button"
                  onClick={() => copyCode(inv.code, inv.id)}
                  className="rounded bg-primary/20 px-2 py-1 text-xs font-medium text-primary transition hover:bg-primary/30"
                >
                  {copiedId === inv.id ? 'Copied!' : 'Copy'}
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete(inv.id)}
                  className="text-gray-500 transition hover:text-red-400"
                >
                  <TrashIcon />
                </button>
              </div>
            ))
          )}
        </SimpleBar>
      </div>
    </div>
  )
}

function XIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  )
}
