import { useState } from 'react'
import type { AdminUser } from '../adminTypes'
import { adminFetch } from '../adminApi'

export function PushTab({ users }: { users: AdminUser[] }) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [selectedUsers, setSelectedUsers] = useState<string[]>([])
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const toggleUser = (id: string) => {
    setSelectedUsers((prev) => (prev.includes(id) ? prev.filter((u) => u !== id) : [...prev, id]))
  }

  const handleSend = async () => {
    if (!title.trim() || !body.trim()) {
      setResult({ type: 'error', text: 'Title and body are required.' })
      return
    }
    setSending(true)
    setResult(null)
    try {
      const payload: { title: string; body: string; userIds?: string[] } = {
        title: title.trim(),
        body: body.trim()
      }
      if (selectedUsers.length > 0) {
        payload.userIds = selectedUsers
      }
      const res = await adminFetch<{ sent: number }>('/api/admin/push', {
        method: 'POST',
        body: payload
      })
      setResult({
        type: 'success',
        text: `Notification sent to ${res.sent} subscription${res.sent !== 1 ? 's' : ''}.`
      })
      setTitle('')
      setBody('')
    } catch (err: unknown) {
      setResult({ type: 'error', text: err instanceof Error ? err.message : 'Failed to send notification' })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-gray-400">
          Send a push notification to selected users, or leave the user selection empty to notify everyone.
        </p>
      </div>

      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-[11px] font-semibold tracking-wide text-gray-400">TITLE</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Notification title"
            className="w-full rounded-md border border-white/10 bg-surface-dark px-3 py-2 text-sm text-gray-200 outline-none transition placeholder:text-gray-500 focus:border-primary"
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-semibold tracking-wide text-gray-400">BODY</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Notification message"
            rows={3}
            className="w-full resize-none rounded-md border border-white/10 bg-surface-dark px-3 py-2 text-sm text-gray-200 outline-none transition placeholder:text-gray-500 focus:border-primary"
          />
        </div>
      </div>

      <div>
        <p className="mb-2 text-[11px] font-semibold tracking-wide text-gray-400">
          RECIPIENTS {selectedUsers.length > 0 ? `(${selectedUsers.length} selected)` : '(all)'}
        </p>
        <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg bg-surface-dark p-2">
          {users.map((u) => (
            <label
              key={u.id}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-gray-300 transition hover:bg-white/5"
            >
              <input
                type="checkbox"
                checked={selectedUsers.includes(u.id)}
                onChange={() => toggleUser(u.id)}
                className="rounded border-gray-600 bg-surface-darkest text-primary focus:ring-primary"
              />
              <span className="truncate">{u.username}</span>
              <span className="ml-auto text-xs text-gray-500">{u.email}</span>
            </label>
          ))}
        </div>
      </div>

      {result && (
        <p className={`text-sm ${result.type === 'error' ? 'text-red-400' : 'text-emerald-400'}`}>{result.text}</p>
      )}

      <button
        type="button"
        onClick={() => void handleSend()}
        disabled={sending}
        className="rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-text transition hover:bg-primary-hover disabled:opacity-50"
      >
        {sending ? 'Sending...' : 'Send Notification'}
      </button>
    </div>
  )
}
