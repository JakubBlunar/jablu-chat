import type { Channel } from '@chat/shared'
import { useCallback, useState } from 'react'
import { ModalOverlay } from '@/components/ui/ModalOverlay'
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

  const name = normalizeChannelName(rawName)

  const nameChanged = name !== channel.name
  const categoryChanged = categoryId !== (channel.categoryId ?? null)
  const archivedChanged = isArchived !== (channel.isArchived ?? false)
  const hasChanges = nameChanged || categoryChanged || archivedChanged

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

        <label className="mt-5 flex cursor-pointer items-center justify-between text-sm text-gray-300">
          <span>
            Archive channel
            <span className="ml-1 text-xs text-gray-500">
              (read-only, hidden from default view)
            </span>
          </span>
          <input
            type="checkbox"
            checked={isArchived}
            onChange={(e) => setIsArchived(e.target.checked)}
            className="h-4 w-4 rounded border-gray-600 bg-surface-darkest text-primary accent-primary"
          />
        </label>

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
