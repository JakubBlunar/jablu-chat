import { Permission } from '@chat/shared'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, InlineAlert, Input, Select, Spinner } from '@/components/ui'
import { ListPagination, useListPage } from '../ListControls'
import { usePermissions } from '@/hooks/usePermissions'
import { api, resolveMediaUrl, type CustomEmoji, type EmojiStat } from '@/lib/api'
import type { Server } from '@/stores/server.store'

export function EmojiStatsTab({ server }: { server: Server }) {
  const { t } = useTranslation('server-settings')
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
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('name')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    setLoading(true)
    setError(null)
    Promise.all([api.getEmojis(server.id), api.getEmojiStats(server.id)])
      .then(([e, s]) => {
        setEmojis(e)
        setStats(s)
      })
      .catch(() => setError(t('emojiStats.loadFailed')))
      .finally(() => setLoading(false))
  }, [server.id, t, retry])

  const statsMap = new Map(stats.map((s) => [s.emoji, s]))
  const filtered = emojis
    .filter((emoji) => emoji.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))
    .sort((a, b) =>
      sort === 'usage'
        ? (statsMap.get(b.name)?.usageCount ?? 0) - (statsMap.get(a.name)?.usageCount ?? 0) ||
          a.name.localeCompare(b.name)
        : a.name.localeCompare(b.name)
    )
  const pagination = useListPage(filtered, JSON.stringify([search, sort]))

  useEffect(
    () => () => {
      if (uploadPreview) URL.revokeObjectURL(uploadPreview)
    },
    [uploadPreview]
  )

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadFile(file)
    setUploadPreview(URL.createObjectURL(file))
    if (!uploadName) {
      setUploadName(
        file.name
          .replace(/\.[^.]+$/, '')
          .replace(/[^a-zA-Z0-9_-]/g, '')
          .toLowerCase()
          .slice(0, 32)
      )
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
      setError(e instanceof Error ? e.message : t('emojiStats.uploadFailed'))
    } finally {
      setUploading(false)
    }
  }

  const handleRename = async (emojiId: string) => {
    if (!renameValue.trim()) return
    setBusyId(emojiId)
    setError(null)
    try {
      const updated = await api.renameEmoji(server.id, emojiId, renameValue.trim())
      setEmojis((prev) => prev.map((e) => (e.id === emojiId ? updated : e)))
      setRenamingId(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : t('emojiStats.renameFailed'))
    } finally {
      setBusyId(null)
    }
  }

  const handleDelete = async (emoji: CustomEmoji) => {
    if (!confirm(t('emojiStats.deleteConfirm', { name: emoji.name }))) return
    setBusyId(emoji.id)
    setError(null)
    try {
      await api.deleteEmoji(server.id, emoji.id)
      setEmojis((prev) => prev.filter((e) => e.id !== emoji.id))
    } catch {
      setError(t('emojiStats.deleteFailed'))
    } finally {
      setBusyId(null)
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
        <InlineAlert variant="error">
          {error}
          <Button type="button" size="sm" variant="secondary" onClick={() => setRetry((value) => value + 1)}>
            {t('lists.retry')}
          </Button>
        </InlineAlert>
      )}

      {canManage && (
        <div className="space-y-3 rounded-lg bg-surface-darkest p-4">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-400">{t('emojiStats.uploadTitle')}</h4>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                aria-label={t('emojiStats.selectImage')}
                className="flex h-16 w-16 items-center justify-center rounded-lg border-2 border-dashed border-white/10 transition hover:border-primary/50"
              >
                {uploadPreview ? (
                  <img src={uploadPreview} alt="" className="h-12 w-12 object-contain" />
                ) : (
                  <svg
                    className="h-6 w-6 text-gray-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
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
            <div className="min-w-[120px] flex-1">
              <Input
                id="emoji-upload-name"
                label={t('emojiStats.nameLabel')}
                type="text"
                value={uploadName}
                onChange={(e) =>
                  setUploadName(
                    e.target.value
                      .replace(/[^a-zA-Z0-9_-]/g, '')
                      .toLowerCase()
                      .slice(0, 32)
                  )
                }
                placeholder={t('emojiStats.namePlaceholder')}
                className="bg-surface"
              />
            </div>
            <Button
              type="button"
              onClick={() => void handleUpload()}
              disabled={!uploadFile || !uploadName.trim() || uploading}
              loading={uploading}
              className="shrink-0"
            >
              {t('actions.upload')}
            </Button>
          </div>
          <p className="text-[11px] text-gray-500">{t('emojiStats.fileInfo')}</p>
        </div>
      )}

      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
          {t('emojiStats.count', { count: emojis.length })}
        </h4>
        <div className="mb-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_160px]">
          <Input
            size="sm"
            aria-label={t('emojiStats.search')}
            placeholder={t('emojiStats.search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Select size="sm" aria-label={t('emojiStats.sort')} value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="name">{t('emojiStats.sortName')}</option>
            <option value="usage">{t('emojiStats.sortUsage')}</option>
          </Select>
        </div>
        {emojis.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-500">{t('emojiStats.empty')}</p>
        ) : (
          <div className="space-y-1">
            {pagination.items.map((e) => {
              const stat = statsMap.get(e.name)
              const isRenaming = renamingId === e.id
              return (
                <div
                  key={e.id}
                  className="flex flex-wrap items-center gap-3 rounded-lg border border-white/5 bg-white/[0.02] p-3"
                >
                  <img src={resolveMediaUrl(e.imageUrl)} alt={e.name} className="h-8 w-8 shrink-0 object-contain" />
                  {isRenaming ? (
                    <div className="min-w-0 flex-1">
                      <Input
                        aria-label={t('emojiStats.nameLabel')}
                        size="sm"
                        type="text"
                        value={renameValue}
                        onChange={(ev) =>
                          setRenameValue(
                            ev.target.value
                              .replace(/[^a-zA-Z0-9_-]/g, '')
                              .toLowerCase()
                              .slice(0, 32)
                          )
                        }
                        onKeyDown={(ev) => {
                          if (ev.key === 'Enter') void handleRename(e.id)
                          if (ev.key === 'Escape') setRenamingId(null)
                        }}
                        autoFocus
                      />
                    </div>
                  ) : (
                    <div className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-white">:{e.name}:</span>
                      {stat && (
                        <span className="ml-2 text-xs text-gray-500">
                          {t('emojiStats.reactions', { count: stat.usageCount })}
                        </span>
                      )}
                    </div>
                  )}
                  {canManage && (
                    <div className="flex shrink-0 items-center gap-1">
                      {isRenaming ? (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => void handleRename(e.id)}
                            disabled={!renameValue.trim() || renameValue === e.name}
                            loading={busyId === e.id}
                            className="text-primary hover:bg-primary/10 hover:text-primary"
                          >
                            {t('actions.save')}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => setRenamingId(null)}
                            disabled={busyId !== null}
                          >
                            {t('emojiStats.cancel')}
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            disabled={busyId !== null}
                            onClick={() => {
                              setRenamingId(e.id)
                              setRenameValue(e.name)
                            }}
                            title={t('emojiStats.rename')}
                            aria-label={t('emojiStats.rename')}
                            className="rounded p-1.5 text-gray-400 transition hover:bg-white/10 hover:text-white"
                          >
                            <svg
                              className="h-3.5 w-3.5"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={2}
                            >
                              <path d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                            </svg>
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            loading={busyId === e.id}
                            disabled={busyId !== null}
                            onClick={() => void handleDelete(e)}
                            title={t('emojiStats.delete')}
                            aria-label={t('emojiStats.delete')}
                            className="rounded p-1.5 text-gray-400 transition hover:bg-red-500/10 hover:text-red-400"
                          >
                            <svg
                              className="h-3.5 w-3.5"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={2}
                            >
                              <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
        {emojis.length > 0 && filtered.length === 0 && (
          <p className="py-10 text-center text-sm text-gray-400">{t('lists.noResults')}</p>
        )}
        <div className="mt-4">
          <ListPagination {...pagination} />
        </div>
      </div>
    </div>
  )
}
