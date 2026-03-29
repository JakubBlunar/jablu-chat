import { useCallback, useEffect, useRef, useState } from 'react'
import { api, resolveMediaUrl } from '@/lib/api'
import { useServerStore } from '@/stores/server.store'
import type { Server } from '@/stores/server.store'
import { CameraIcon } from '../serverSettingsIcons'

export function OverviewTab({ server }: { server: Server }) {
  const [name, setName] = useState(server.name)
  const [saving, setSaving] = useState(false)
  const [iconPreview, setIconPreview] = useState<string | null>(resolveMediaUrl(server.iconUrl) ?? null)
  const fileRef = useRef<HTMLInputElement>(null)
  const updateServerInList = useServerStore((s) => s.updateServerInList)

  const [vanityCode, setVanityCode] = useState(server.vanityCode ?? '')
  const [savingVanity, setSavingVanity] = useState(false)
  const [vanityError, setVanityError] = useState<string | null>(null)

  const [error, setError] = useState<string | null>(null)

  const saveName = useCallback(async () => {
    if (!name.trim() || name === server.name) return
    setSaving(true)
    setError(null)
    try {
      await api.updateServer(server.id, { name: name.trim() })
      updateServerInList(server.id, { name: name.trim() })
    } catch {
      setError('Failed to update server name')
    } finally {
      setSaving(false)
    }
  }, [name, server, updateServerInList])

  const handleIconChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      const preview = URL.createObjectURL(file)
      setIconPreview((prev) => {
        if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev)
        return preview
      })
      try {
        const updated = (await api.uploadServerIcon(server.id, file)) as {
          iconUrl: string
        }
        updateServerInList(server.id, { iconUrl: updated.iconUrl })
        setIconPreview((prev) => {
          if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev)
          return updated.iconUrl
        })
      } catch {
        setIconPreview((prev) => {
          if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev)
          return server.iconUrl
        })
        setError('Failed to upload server icon')
      }
    },
    [server, updateServerInList]
  )

  const removeIcon = useCallback(async () => {
    try {
      await api.deleteServerIcon(server.id)
      updateServerInList(server.id, { iconUrl: null })
      setIconPreview(null)
    } catch {
      setError('Failed to remove icon')
    }
  }, [server.id, updateServerInList])

  useEffect(() => {
    return () => {
      if (iconPreview && iconPreview.startsWith('blob:')) URL.revokeObjectURL(iconPreview)
    }
  }, [])

  return (
    <div className="space-y-6">
      {error && <div className="rounded bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</div>}
      <div className="flex items-start gap-6">
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="group relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-primary text-3xl font-bold text-white transition hover:opacity-80"
          >
            {iconPreview ? (
              <img src={iconPreview} alt="Server icon" className="h-full w-full object-cover" />
            ) : (
              server.name.charAt(0).toUpperCase()
            )}
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition group-hover:opacity-100">
              <CameraIcon />
            </div>
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleIconChange} />
          {iconPreview && (
            <button type="button" onClick={removeIcon} className="text-xs text-red-400 hover:underline">
              Remove
            </button>
          )}
        </div>

        <div className="flex-1 space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">Server Name</label>
          <div className="flex gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              className="flex-1 rounded-md border border-white/10 bg-surface-darkest px-3 py-2 text-sm text-white outline-none focus:border-primary"
            />
            <button
              type="button"
              disabled={saving || !name.trim() || name === server.name}
              onClick={saveName}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">Vanity URL</label>
        <p className="text-xs text-gray-500">A custom invite link for your server. 3-32 lowercase characters, numbers, and hyphens.</p>
        <div className="flex gap-2">
          <div className="flex flex-1 items-center rounded-md border border-white/10 bg-surface-darkest text-sm">
            <span className="shrink-0 pl-3 text-gray-500">{window.location.origin}/invite/</span>
            <input
              value={vanityCode}
              onChange={(e) => setVanityCode(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              maxLength={32}
              placeholder="my-server"
              className="min-w-0 flex-1 bg-transparent px-1 py-2 text-white outline-none placeholder:text-gray-600"
            />
          </div>
          <button
            type="button"
            disabled={savingVanity || vanityCode === (server.vanityCode ?? '')}
            onClick={async () => {
              setSavingVanity(true)
              setVanityError(null)
              try {
                await api.updateServer(server.id, { vanityCode: vanityCode || null })
                updateServerInList(server.id, { vanityCode: vanityCode || null })
              } catch (e) {
                setVanityError(e instanceof Error ? e.message : 'Failed to update vanity URL')
              } finally {
                setSavingVanity(false)
              }
            }}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover disabled:opacity-50"
          >
            {savingVanity ? 'Saving…' : 'Save'}
          </button>
        </div>
        {vanityError && <p className="text-xs text-red-400">{vanityError}</p>}
      </div>
    </div>
  )
}
