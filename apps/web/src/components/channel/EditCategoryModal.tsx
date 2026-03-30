import type { ChannelCategory } from '@chat/shared'
import { useCallback, useState } from 'react'
import { Button, Input, ModalFooter } from '@/components/ui'
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
      <div className="mt-4">
        <Input
          label="Category name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
          autoFocus
        />
      </div>
      {error && (
        <p className="mt-3 text-sm text-red-400" role="alert">{error}</p>
      )}
      <div className="mt-6 flex justify-between">
        <div>
          {!confirmDelete ? (
            <Button variant="ghost" className="text-red-400 hover:bg-red-500/10" onClick={() => setConfirmDelete(true)}>
              Delete Category
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <Button variant="danger" onClick={handleDelete} disabled={deleting} loading={deleting}>
                {deleting ? 'Deleting…' : 'Confirm'}
              </Button>
              <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
                Cancel
              </Button>
            </div>
          )}
        </div>
        <ModalFooter
          className="!mt-0"
          onCancel={onClose}
          onConfirm={() => void handleSave()}
          cancelLabel="Cancel"
          confirmLabel="Save"
          loading={saving}
          disabled={!name.trim() || name.trim() === category.name}
        />
      </div>
    </ModalOverlay>
  )
}
