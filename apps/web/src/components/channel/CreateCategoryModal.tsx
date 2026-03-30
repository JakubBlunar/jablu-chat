import { useState } from 'react'
import { Button, Input } from '@/components/ui'
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
      <div className="mt-4">
        <Input
          id="create-category-name"
          label="Category name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Information"
          maxLength={100}
          autoFocus
        />
      </div>
      {error && (
        <p className="mt-3 text-sm text-red-400" role="alert">{error}</p>
      )}
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button onClick={() => void handleCreate()} disabled={busy || !name.trim()} loading={busy}>
          {busy ? 'Creating…' : 'Create'}
        </Button>
      </div>
    </ModalOverlay>
  )
}
