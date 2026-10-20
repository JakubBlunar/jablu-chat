import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, InlineAlert, Select } from '@/components/ui'
import { api } from '@/lib/api'
import { useChannelStore } from '@/stores/channel.store'
import { useServerStore } from '@/stores/server.store'
import type { Server } from '@/stores/server.store'

const TIMEOUT_OPTIONS = [
  { value: 60, label: '1Minute' },
  { value: 300, label: '5Minutes' },
  { value: 600, label: '10Minutes' },
  { value: 900, label: '15Minutes' },
  { value: 1800, label: '30Minutes' },
  { value: 3600, label: '1Hour' }
]

export function AfkTab({ server }: { server: Server }) {
  const { t } = useTranslation('server-settings')
  const channels = useChannelStore((s) => s.channels)
  const voiceChannels = channels.filter((c) => c.type === 'voice' && !c.isArchived)
  const updateServerInList = useServerStore((s) => s.updateServerInList)

  const [channelId, setChannelId] = useState(server.afkChannelId ?? '')
  const [timeout, setTimeout_] = useState(server.afkTimeout ?? 300)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const hasChanges =
    channelId !== (server.afkChannelId ?? '') ||
    timeout !== (server.afkTimeout ?? 300)

  const handleSave = useCallback(async () => {
    setSaving(true)
    setError(null)
    setSuccess(false)
    try {
      await api.updateServer(server.id, {
        afkChannelId: channelId || null,
        afkTimeout: timeout
      })
      updateServerInList(server.id, {
        afkChannelId: channelId || null,
        afkTimeout: timeout
      })
      setSuccess(true)
      globalThis.setTimeout(() => setSuccess(false), 3000)
    } catch (e) {
      setError(e instanceof Error ? e.message : t('afk.saveFailed'))
    } finally {
      setSaving(false)
    }
  }, [server.id, channelId, timeout, updateServerInList, t])

  const handleDisable = useCallback(async () => {
    setSaving(true)
    setError(null)
    try {
      await api.updateServer(server.id, { afkChannelId: null })
      updateServerInList(server.id, { afkChannelId: null })
      setChannelId('')
    } catch (e) {
      setError(e instanceof Error ? e.message : t('afk.disableFailed'))
    } finally {
      setSaving(false)
    }
  }, [server.id, updateServerInList, t])

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-white">{t('afk.title')}</h3>
        <p className="mt-1 text-sm text-gray-400">
          {t('afk.description')}
        </p>
      </div>

      {error && <InlineAlert variant="error">{error}</InlineAlert>}
      {success && <InlineAlert variant="success">{t('afk.saved')}</InlineAlert>}

      <div className="space-y-4">
        <Select
          label={t('afk.channelLabel')}
          value={channelId}
          onChange={(e) => setChannelId(e.target.value)}
        >
          <option value="">{t('afk.channelDisabled')}</option>
          {voiceChannels.map((ch) => (
            <option key={ch.id} value={ch.id}>🔊 {ch.name}</option>
          ))}
        </Select>

        <Select
          label={t('afk.timeoutLabel')}
          value={timeout}
          onChange={(e) => setTimeout_(Number(e.target.value))}
        >
          {TIMEOUT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{t(`afk.timeouts.${opt.label}`)}</option>
          ))}
        </Select>
      </div>

      <div className="flex gap-2">
        <Button
          type="button"
          disabled={!hasChanges}
          loading={saving}
          onClick={() => void handleSave()}
        >
          {t('actions.save')}
        </Button>
        {server.afkChannelId && (
          <Button
            type="button"
            variant="secondary"
            disabled={saving}
            onClick={() => void handleDisable()}
          >
            {t('actions.disable')}
          </Button>
        )}
      </div>
    </div>
  )
}
