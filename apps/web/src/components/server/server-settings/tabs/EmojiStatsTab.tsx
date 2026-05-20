import { Permission } from '@chat/shared'
import { useEffect, useRef, useState } from 'react'
import { InlineAlert, Spinner } from '@/components/ui'
import { usePermissions } from '@/hooks/usePermissions'
import { api, resolveMediaUrl, type CustomEmoji, type EmojiStat } from '@/lib/api'
import type { Server } from '@/stores/server.store'

export function EmojiStatsTab({ server }: { server: Server }) {
  const { has: hasPerm } = usePermissions(server.id)
  const canManage = hasPerm(Permission.MANAGE_EMOJIS)

  const [emojis, setEmojis] = useState<CustomEmoji[]>([])
  const [stats, setStats] = useState<EmojiStat[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [uploadName, setUploadName] = useState('')
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadPreview, setUploadPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  useEffect(() => {
    setLoading(true)
    setError(null)
    Promise.all([
      api.getEmojis(server.id),
      api.getEmojiStats(server.id)
    ])
      .then(([e, s]) => { setEmojis(e); setStats(s) })
      .catch(() => setError('Failed to load emojis'))
      .finally(() => setLoading(false))
  }, [server.id])

  const statsMap = new Map(stats.map((s) => [s.emoji, s]))

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadFile(file)
    setUploadPreview(URL.createObjectURL(file))
    if (!uploadName) {
      setUploadName(file.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase().slice(0, 32))
    }
  }

  const handleUpload = async () => {
    if (!uploadFile || !uploadName.trim()) return
    setUploading(true)
    setError(null)
    try {
      const emoji = await api.uploadEmoji(server.id, uploadName.trim(), uploadFile)
      setEmojis((prev) => [...prev, emoji])
      setUploadName('')
      setUploadFile(null)
      if (uploadPreview) URL.revokeObjectURL(uploadPreview)
      setUploadPreview(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const handleRename = async (emojiId: string) => {
    if (!renameValue.trim()) return
    setError(null)
    try {
      const updated = await api.renameEmoji(server.id, emojiId, renameValue.trim())
      setEmojis((prev) => prev.map((e) => (e.id === emojiId ? updated : e)))
      setRenamingId(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Rename failed')
    }
  }

  const handleDelete = async (emoji: CustomEmoji) => {
    if (!confirm(`Delete :${emoji.name}:? This cannot be undone.`)) return
    setError(null)
    try {
      await api.deleteEmoji(server.id, emoji.id)
      setEmojis((prev) => prev.filter((e) => e.id !== emoji.id))
    } catch {
      setError('Failed to delete emoji')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="md" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {error && (
        <InlineAlert variant="error">{error}</InlineAlert>
      )}

      {canManage && (
        <div className="space-y-3 rounded-lg bg-surface-darkest p-4">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Upload Emoji</h4>
          <div className="flex items-end gap-3">
            <div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex h-16 w-16 items-center justify-center rounded-lg border-2 border-dashed border-white/10 transition hover:border-primary/50"
              >
                {uploadPreview ? (
                  <img src={uploadPreview} alt="" className="h-12 w-12 object-contain" />
                ) : (
                  <svg className="h-6 w-6 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path d="M12 4v16m8-8H4" />
                  </svg>
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp,image/heic,image/heif"
                onChange={handleFileSelect}
                className="absolute opacity-0 w-px h-px pointer-events-none"
              />
            </div>
            <div className="min-w-0 flex-1">
              <label className="mb-1 block text-xs text-gray-400">Name</label>
              <input
                type="text"
                value={uploadName}
                onChange={(e) => setUploadName(e.target.value.replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase().slice(0, 32))}
                placeholder="emoji_name"
                className="w-full rounded-md bg-surface px-3 py-2 text-sm text-white outline-none ring-1 ring-white/10 focus:ring-primary"
              />
            </div>
            <button
              type="button"
              onClick={() => void handleUpload()}
              disabled={!uploadFile || !uploadName.trim() || uploading}
              className="shrink-0 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-text transition hover:bg-primary-hover disabled:opacity-50"
            >
              {uploading ? 'Uploading...' : 'Upload'}
            </button>
          </div>
          <p className="text-[11px] text-gray-500">PNG, JPG, GIF, or WebP. Max 200 KB. Will be resized to 128x128.</p>
        </div>
      )}

      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
          Emojis — {emojis.length}/50
        </h4>
        {emojis.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-500">No custom emojis yet.</p>
        ) : (
          <div className="space-y-1">
            {emojis.map((e) => {
              const stat = statsMap.get(e.name)
              const isRenaming = renamingId === e.id
              return (
                <div key={e.id} className="flex items-center gap-3 rounded-md px-3 py-2 transition hover:bg-white/[0.04]">
                  <img
                    src={resolveMediaUrl(e.imageUrl)}
                    alt={e.name}
                    className="h-8 w-8 shrink-0 object-contain"
                  />
                  {isRenaming ? (
                    <input
                      type="text"
                      value={renameValue}
                      onChange={(ev) => setRenameValue(ev.target.value.replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase().slice(0, 32))}
                      onKeyDown={(ev) => {
                        if (ev.key === 'Enter') void handleRename(e.id)
                        if (ev.key === 'Escape') setRenamingId(null)
                      }}
                      autoFocus
                      className="min-w-0 flex-1 rounded bg-surface-darkest px-2 py-1 text-sm text-white outline-none ring-1 ring-white/10 focus:ring-primary"
                    />
                  ) : (
                    <div className="min-w-0 flex-1">
                      <span className="text-sm font-medium text-white">:{e.name}:</span>
                      {stat && (
                        <span className="ml-2 text-xs text-gray-500">
                          {stat.usageCount} reaction{stat.usageCount !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  )}
                  {canManage && (
                    <div className="flex shrink-0 items-center gap-1">
                      {isRenaming ? (
                        <>
                          <button
                            type="button"
                            onClick={() => void handleRename(e.id)}
                            className="rounded px-2 py-1 text-xs text-primary transition hover:bg-primary/10"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setRenamingId(null)}
                            className="rounded px-2 py-1 text-xs text-gray-400 transition hover:bg-white/5"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => { setRenamingId(e.id); setRenameValue(e.name) }}
                            title="Rename"
                            className="rounded p-1.5 text-gray-400 transition hover:bg-white/10 hover:text-white"
                          >
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDelete(e)}
                            title="Delete"
                            className="rounded p-1.5 text-gray-400 transition hover:bg-red-500/10 hover:text-red-400"
                          >
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
