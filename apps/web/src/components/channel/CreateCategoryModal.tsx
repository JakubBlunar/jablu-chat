import { useState } from 'react'
import { ModalOverlay } from '@/components/ui/ModalOverlay'
import { api } from '@/lib/api'
import { useChannelStore } from '@/stores/channel.store'
import { useServerStore } from '@/stores/server.store'

export function CreateCategoryModal({ onClose }: { onClose: () => void }) {
  const currentServerId = useServerStore((s) => s.currentServerId)
  const addCategory = useChannelStore((s) => s.addCategory)

  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCreate() {
    if (!currentServerId) return
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Name is required.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const created = await api.createCategory(currentServerId, trimmed)
      addCategory(created)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create category.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <ModalOverlay onClose={onClose}>
      <h2 className="text-xl font-semibold text-white">Create Category</h2>
      <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-gray-400">
        Category name
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Information"
          className="mt-1.5 w-full rounded-md border-0 bg-surface-darkest px-3 py-2.5 text-sm text-white outline-none ring-1 ring-white/10 transition placeholder:text-gray-500 focus:ring-2 focus:ring-primary"
          maxLength={100}
          autoFocus
        />
      </label>
      {error && (
        <p className="mt-3 text-sm text-red-400" role="alert">{error}</p>
      )}
      <div className="mt-6 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="rounded-md px-4 py-2 text-sm font-medium text-gray-300 transition hover:bg-white/5 hover:text-white disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void handleCreate()}
          disabled={busy || !name.trim()}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover disabled:opacity-50"
        >
          {busy ? 'Creating…' : 'Create'}
        </button>
      </div>
    </ModalOverlay>
  )
}
