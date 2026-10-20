import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, InlineAlert, Input } from '@/components/ui'
import { api, resolveMediaUrl } from '@/lib/api'
import { useServerStore } from '@/stores/server.store'
import type { Server } from '@/stores/server.store'
import { CameraIcon } from '../serverSettingsIcons'

export function OverviewTab({ server }: { server: Server }) {
  const { t } = useTranslation('server-settings')
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
      setError(t('overview.nameFailed'))
    } finally {
      setSaving(false)
    }
  }, [name, server, updateServerInList, t])

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
        setError(t('overview.uploadFailed'))
      }
    },
    [server, updateServerInList, t]
  )

  const removeIcon = useCallback(async () => {
    try {
      await api.deleteServerIcon(server.id)
      updateServerInList(server.id, { iconUrl: null })
      setIconPreview(null)
    } catch {
      setError(t('overview.removeFailed'))
    }
  }, [server.id, updateServerInList, t])

  useEffect(() => {
    return () => {
      if (iconPreview && iconPreview.startsWith('blob:')) URL.revokeObjectURL(iconPreview)
    }
  }, [])

  return (
    <div className="space-y-6">
      {error && <InlineAlert variant="error">{error}</InlineAlert>}
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:gap-6">
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            aria-label={t('overview.changeIcon')}
            className="group relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-primary text-3xl font-bold text-primary-text transition hover:opacity-80"
          >
            {iconPreview ? (
              <img src={iconPreview} alt={t('overview.iconAlt', { serverName: server.name })} className="h-full w-full object-cover" />
            ) : (
              server.name.charAt(0).toUpperCase()
            )}
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition group-hover:opacity-100">
              <CameraIcon />
            </div>
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="absolute opacity-0 w-px h-px pointer-events-none" onChange={handleIconChange} />
          {iconPreview && (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={removeIcon}
              className="text-xs text-red-400 hover:underline"
            >
              {t('actions.remove')}
            </Button>
          )}
        </div>

        <div className="w-full min-w-0 flex-1">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              <Input
                id="overview-server-name"
                label={t('overview.nameLabel')}
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
              />
            </div>
            <Button
              type="button"
              disabled={!name.trim() || name === server.name}
              loading={saving}
              onClick={saveName}
              className="w-full sm:w-auto"
            >
              {t('actions.save')}
            </Button>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">{t('overview.vanityUrl')}</label>
        <p className="text-xs text-gray-500">{t('overview.vanityDescription')}</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="flex min-w-0 flex-1 items-center rounded-md border border-white/10 bg-surface-darkest text-sm">
            <span className="min-w-0 truncate pl-3 text-gray-500">{window.location.origin}/invite/</span>
            <input
              value={vanityCode}
              onChange={(e) => setVanityCode(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              maxLength={32}
              placeholder={t('overview.vanityPlaceholder')}
              className="min-w-0 flex-1 bg-transparent px-1 py-2 text-white outline-none placeholder:text-gray-600"
            />
          </div>
          <Button
            className="w-full sm:w-auto"
            disabled={savingVanity || vanityCode === (server.vanityCode ?? '')}
            loading={savingVanity}
            onClick={async () => {
              setSavingVanity(true)
              setVanityError(null)
              try {
                await api.updateServer(server.id, { vanityCode: vanityCode || null })
                updateServerInList(server.id, { vanityCode: vanityCode || null })
              } catch (e) {
                setVanityError(e instanceof Error ? e.message : t('overview.vanityUpdateFailed'))
              } finally {
                setSavingVanity(false)
              }
            }}
          >
            {savingVanity ? t('actions.saving') : t('actions.save')}
          </Button>
        </div>
        {vanityError && <p className="text-xs text-red-400">{vanityError}</p>}
      </div>
    </div>
  )
}
