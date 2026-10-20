import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, InlineAlert } from '@/components/ui'
import { api } from '@/lib/api'
import { useServerStore } from '@/stores/server.store'
import type { Server } from '@/stores/server.store'

export function LevelingTab({ server }: { server: Server }) {
  const { t } = useTranslation('server-settings')
  const updateServerInList = useServerStore((s) => s.updateServerInList)

  const [enabled, setEnabled] = useState(!!server.xpEnabled)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const hasChanges = enabled !== !!server.xpEnabled

  const handleSave = useCallback(async () => {
    setSaving(true)
    setError(null)
    setSuccess(false)
    try {
      await api.updateServer(server.id, { xpEnabled: enabled })
      updateServerInList(server.id, { xpEnabled: enabled })
      setSuccess(true)
      globalThis.setTimeout(() => setSuccess(false), 3000)
    } catch (e) {
      setError(e instanceof Error ? e.message : t('leveling.saveFailed'))
    } finally {
      setSaving(false)
    }
  }, [server.id, enabled, updateServerInList, t])

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-white">{t('leveling.title')}</h3>
        <p className="mt-1 text-sm text-gray-400">{t('leveling.description')}</p>
      </div>

      {error && <InlineAlert variant="error">{error}</InlineAlert>}
      {success && <InlineAlert variant="success">{t('leveling.saved')}</InlineAlert>}

      <label className="flex cursor-pointer items-start gap-3 rounded-md border border-white/10 bg-surface-darkest p-4">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-white/20 bg-surface text-primary focus:ring-primary"
        />
        <div className="flex-1">
          <div className="text-sm font-medium text-white">{t('leveling.enable')}</div>
          <p className="mt-1 text-xs text-gray-400">{t('leveling.enableDescription')}</p>
        </div>
      </label>

      <div>
        <Button
          type="button"
          disabled={!hasChanges}
          loading={saving}
          onClick={() => void handleSave()}
        >
          {t('actions.save')}
        </Button>
      </div>
    </div>
  )
}
