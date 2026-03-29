import type { ChannelCategory } from '@chat/shared'
import { useCallback, useState } from 'react'
import { ModalOverlay } from '@/components/ui/ModalOverlay'
import { api } from '@/lib/api'
import { useChannelStore } from '@/stores/channel.store'
import { useServerStore } from '@/stores/server.store'

export function EditCategoryModal({ category, onClose }: { category: ChannelCategory; onClose: () => void }) {
  const currentServerId = useServerStore((s) => s.currentServerId)
  const updateCategory = useChannelStore((s) => s.updateCategory)
  const removeCategory = useChannelStore((s) => s.removeCategory)

  const [name, setName] = useState(category.name)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const handleSave = useCallback(async () => {
    if (!currentServerId) return
    const trimmed = name.trim()
    if (!trimmed || trimmed === category.name) {
      onClose()
      return
    }
    setSaving(true)
    setError(null)
    try {
      const updated = await api.updateCategory(currentServerId, category.id, { name: trimmed })
      updateCategory(updated)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update category.')
    } finally {
      setSaving(false)
    }
  }, [currentServerId, category, name, updateCategory, onClose])

  const handleDelete = useCallback(async () => {
    if (!currentServerId) return
    setDeleting(true)
    setError(null)
    try {
      await api.deleteCategory(currentServerId, category.id)
      removeCategory(category.id)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete category.')
      setDeleting(false)
    }
  }, [currentServerId, category.id, removeCategory, onClose])

  return (
    <ModalOverlay onClose={onClose}>
      <h2 className="text-xl font-semibold text-white">Edit Category</h2>
      <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-gray-400">
        Category name
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1.5 w-full rounded-md border-0 bg-surface-darkest px-3 py-2.5 text-sm text-white outline-none ring-1 ring-white/10 transition placeholder:text-gray-500 focus:ring-2 focus:ring-primary"
          maxLength={100}
          autoFocus
        />
      </label>
      {error && (
        <p className="mt-3 text-sm text-red-400" role="alert">{error}</p>
      )}
      <div className="mt-6 flex justify-between">
        <div>
          {!confirmDelete ? (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="rounded-md px-3 py-2 text-sm font-medium text-red-400 transition hover:bg-red-500/10"
            >
              Delete Category
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? 'Deleting…' : 'Confirm'}
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
            disabled={saving || !name.trim() || name.trim() === category.name}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </ModalOverlay>
  )
}
