import type { ChannelType } from '@chat/shared'
import { useState } from 'react'
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

type CreateChannelModalProps = {
  open: boolean
  onClose: () => void
  defaultCategoryId?: string | null
}

export function CreateChannelModal({ open, onClose, defaultCategoryId }: CreateChannelModalProps) {
  const currentServerId = useServerStore((s) => s.currentServerId)
  const fetchChannels = useChannelStore((s) => s.fetchChannels)
  const categories = useChannelStore((s) => s.categories)
  const { goToChannel } = useAppNavigate()

  const [rawName, setRawName] = useState('')
  const [type, setType] = useState<ChannelType>('text')
  const [categoryId, setCategoryId] = useState<string | null>(defaultCategoryId ?? null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const name = normalizeChannelName(rawName)

  if (!open) return null

  async function handleCreate() {
    if (!currentServerId) {
      setError('No server selected.')
      return
    }
    if (!name || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) {
      setError('Use lowercase letters, numbers, and hyphens only (e.g. my-channel).')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const created = await api.post<{
        id: string
        serverId: string
        name: string
        type: ChannelType
        position: number
        createdAt: string
      }>(`/api/servers/${currentServerId}/channels`, { name, type, categoryId: categoryId || undefined })
      await fetchChannels(currentServerId)
      if (type === 'text' && currentServerId) {
        goToChannel(currentServerId, created.id)
      }
      setRawName('')
      setType('text')
      setCategoryId(null)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create channel.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <ModalOverlay onClose={onClose}>
      <h2 className="text-xl font-semibold text-white">Create Channel</h2>
        <p className="mt-2 text-sm text-gray-400">Names are saved in lowercase with hyphens instead of spaces.</p>
        <label className="mt-5 block text-xs font-semibold uppercase tracking-wide text-gray-400">
          Channel name
          <input
            type="text"
            value={rawName}
            onChange={(e) => setRawName(e.target.value)}
            placeholder="new-channel"
            className="mt-1.5 w-full rounded-md border-0 bg-surface-darkest px-3 py-2.5 text-sm text-white outline-none ring-1 ring-white/10 transition placeholder:text-gray-500 focus:ring-2 focus:ring-primary"
            maxLength={100}
            autoFocus
          />
        </label>
        {name ? (
          <p className="mt-1.5 text-xs text-gray-500">
            Will be created as <span className="text-gray-300">#{name}</span>
          </p>
        ) : null}

        <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-gray-400">Channel type</p>
        <div className="mt-2 flex flex-col gap-2">
          {(
            [
              { value: 'text' as const, label: 'Text', hint: 'Post messages' },
              {
                value: 'voice' as const,
                label: 'Voice',
                hint: 'Hang out with voice'
              }
            ] as const
          ).map((opt) => (
            <label
              key={opt.value}
              className={`flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2.5 transition ${
                type === opt.value
                  ? 'border-primary bg-primary/15'
                  : 'border-transparent bg-surface-darkest hover:bg-surface-darkest/80'
              }`}
            >
              <input
                type="radio"
                name="channel-type"
                value={opt.value}
                checked={type === opt.value}
                onChange={() => setType(opt.value)}
                className="h-4 w-4 accent-primary"
              />
              <span>
                <span className="block text-sm font-medium text-white">{opt.label}</span>
                <span className="text-xs text-gray-500">{opt.hint}</span>
              </span>
            </label>
          ))}
        </div>

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

        {error ? (
          <p className="mt-3 text-sm text-red-400" role="alert">
            {error}
          </p>
        ) : null}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setRawName('')
              setError(null)
              setType('text')
              setCategoryId(null)
              onClose()
            }}
            disabled={busy}
            className="rounded-md px-4 py-2 text-sm font-medium text-gray-300 transition hover:bg-white/5 hover:text-white disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={busy}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-text transition hover:bg-primary-hover disabled:opacity-50"
          >
            {busy ? 'Creating…' : 'Create'}
          </button>
        </div>
    </ModalOverlay>
  )
}
