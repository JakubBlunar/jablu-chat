import type { ChannelType, ForumLayout } from '@chat/shared'
import { useState } from 'react'
import { Input, Label, ModalFooter } from '@/components/ui'
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

type DraftForumTag = {
  name: string
  color: string
}

export function CreateChannelModal({ open, onClose, defaultCategoryId }: CreateChannelModalProps) {
  const currentServerId = useServerStore((s) => s.currentServerId)
  const fetchChannels = useChannelStore((s) => s.fetchChannels)
  const categories = useChannelStore((s) => s.categories)
  const { goToChannel } = useAppNavigate()

  const [rawName, setRawName] = useState('')
  const [type, setType] = useState<ChannelType>('text')
  const [categoryId, setCategoryId] = useState<string | null>(defaultCategoryId ?? null)
  const [defaultLayout, setDefaultLayout] = useState<ForumLayout>('list')
  const [postGuidelines, setPostGuidelines] = useState('')
  const [requireTags, setRequireTags] = useState(false)
  const [draftTags, setDraftTags] = useState<DraftForumTag[]>([])
  const [draftTagName, setDraftTagName] = useState('')
  const [draftTagColor, setDraftTagColor] = useState('#7c3aed')
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
      const body: Record<string, unknown> = { name, type, categoryId: categoryId || undefined }
      if (type === 'forum') {
        body.defaultLayout = defaultLayout
        if (postGuidelines.trim()) body.postGuidelines = postGuidelines.trim()
        body.requireTags = requireTags
      }
      const created = await api.post<{
        id: string
        serverId: string
        name: string
        type: ChannelType
        position: number
        createdAt: string
      }>(`/api/servers/${currentServerId}/channels`, body)
      if (type === 'forum' && draftTags.length > 0) {
        for (const tag of draftTags) {
          await api.createForumTag(created.id, { name: tag.name, color: tag.color })
        }
      }
      await fetchChannels(currentServerId)
      if ((type === 'text' || type === 'forum') && currentServerId) {
        goToChannel(currentServerId, created.id)
      }
      setRawName('')
      setType('text')
      setCategoryId(null)
      setDefaultLayout('list')
      setPostGuidelines('')
      setRequireTags(false)
      setDraftTags([])
      setDraftTagName('')
      setDraftTagColor('#7c3aed')
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
        <div className="mt-5">
          <Input
            id="create-channel-name"
            label="Channel name"
            type="text"
            value={rawName}
            onChange={(e) => setRawName(e.target.value)}
            placeholder="new-channel"
            maxLength={100}
            autoFocus
          />
        </div>
        {name ? (
          <p className="mt-1.5 text-xs text-gray-500">
            Will be created as <span className="text-gray-300">#{name}</span>
          </p>
        ) : null}

        <Label className="mt-5 block">Channel type</Label>
        <div className="mt-2 flex flex-col gap-2">
          {(
            [
              { value: 'text' as const, label: 'Text', hint: 'Post messages' },
              { value: 'voice' as const, label: 'Voice', hint: 'Hang out with voice' },
              { value: 'forum' as const, label: 'Forum', hint: 'Create posts with titles and tags' }
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
          <div className="mt-5">
            <Label htmlFor="create-channel-category">Category</Label>
            <select
              id="create-channel-category"
              value={categoryId ?? ''}
              onChange={(e) => setCategoryId(e.target.value || null)}
              className="mt-1.5 w-full rounded-md border-0 bg-surface-darkest px-3 py-2.5 text-sm text-white outline-none ring-1 ring-white/10 transition focus:ring-2 focus:ring-primary"
            >
              <option value="">No category</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </div>
        )}

        {type === 'forum' && (
          <div className="mt-5 space-y-4 rounded-lg border border-white/10 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Forum Settings</p>
            <div>
              <Label>Default layout</Label>
              <div className="mt-1.5 flex gap-2">
                {(['list', 'grid'] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setDefaultLayout(v)}
                    className={`rounded-md px-3 py-1.5 text-sm capitalize transition ${
                      defaultLayout === v
                        ? 'bg-primary text-primary-text'
                        : 'bg-surface-darkest text-gray-400 hover:text-white'
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label htmlFor="post-guidelines">Post guidelines</Label>
              <textarea
                id="post-guidelines"
                value={postGuidelines}
                onChange={(e) => setPostGuidelines(e.target.value)}
                placeholder="Optional guidelines shown above the post list..."
                maxLength={2000}
                rows={2}
                className="mt-1.5 w-full resize-none rounded-md border-0 bg-surface-darkest px-3 py-2 text-sm text-white outline-none ring-1 ring-white/10 transition placeholder:text-gray-600 focus:ring-2 focus:ring-primary"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-300">
              <input
                type="checkbox"
                checked={requireTags}
                onChange={(e) => setRequireTags(e.target.checked)}
                className="h-4 w-4 accent-primary"
              />
              Require tags on posts
            </label>
            <div className="rounded-md bg-surface-darkest p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Forum tags (optional)</p>
              <p className="mt-1 text-xs text-gray-500">Create starter tags for this channel.</p>
              <div className="mt-3 flex flex-wrap items-end gap-2">
                <input
                  type="text"
                  value={draftTagName}
                  onChange={(e) => setDraftTagName(e.target.value)}
                  placeholder="Tag name"
                  maxLength={32}
                  className="min-w-0 flex-1 rounded-md border-0 bg-surface px-2.5 py-2 text-sm text-white outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-primary"
                />
                <input
                  type="color"
                  value={draftTagColor}
                  onChange={(e) => setDraftTagColor(e.target.value)}
                  className="h-9 w-11 rounded border-0 bg-surface p-1 ring-1 ring-white/10"
                  aria-label="New tag color"
                />
                <button
                  type="button"
                  onClick={() => {
                    const name = draftTagName.trim()
                    if (!name) return
                    if (draftTags.some((t) => t.name.toLowerCase() === name.toLowerCase())) return
                    setDraftTags((prev) => [...prev, { name, color: draftTagColor }])
                    setDraftTagName('')
                  }}
                  disabled={!draftTagName.trim()}
                  className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-text transition hover:bg-primary-hover disabled:opacity-50"
                >
                  Add tag
                </button>
              </div>
              {draftTags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {draftTags.map((tag, idx) => (
                    <span
                      key={`${tag.name}-${idx}`}
                      className="inline-flex items-center gap-2 rounded-full border border-white/10 px-2 py-1 text-xs text-white"
                      style={{ backgroundColor: `${tag.color}33`, borderColor: `${tag.color}99` }}
                    >
                      <span>{tag.name}</span>
                      <button
                        type="button"
                        onClick={() => setDraftTags((prev) => prev.filter((_, i) => i !== idx))}
                        className="rounded-sm px-1 text-gray-300 hover:bg-black/20 hover:text-white"
                        aria-label={`Remove ${tag.name}`}
                      >
                        x
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {error ? (
          <p className="mt-3 text-sm text-red-400" role="alert">
            {error}
          </p>
        ) : null}

        <ModalFooter
          onCancel={() => {
            setRawName('')
            setError(null)
            setType('text')
            setCategoryId(null)
            setDefaultLayout('list')
            setPostGuidelines('')
            setRequireTags(false)
            setDraftTags([])
            setDraftTagName('')
            setDraftTagColor('#7c3aed')
            onClose()
          }}
          onConfirm={() => void handleCreate()}
          cancelLabel="Cancel"
          confirmLabel="Create"
          loading={busy}
        />
    </ModalOverlay>
  )
}
