import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, InlineAlert, Select, Textarea } from '@/components/ui'
import { api } from '@/lib/api'
import { useChannelStore } from '@/stores/channel.store'
import { useServerStore } from '@/stores/server.store'
import type { Server } from '@/stores/server.store'

export function WelcomeTab({ server }: { server: Server }) {
  const { t } = useTranslation('server-settings')
  const channels = useChannelStore((s) => s.channels)
  const textChannels = channels.filter((c) => c.type === 'text' && !c.isArchived)
  const updateServerInList = useServerStore((s) => s.updateServerInList)

  const [channelId, setChannelId] = useState(server.welcomeChannelId ?? '')
  const [message, setMessage] = useState(server.welcomeMessage ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const hasChanges =
    channelId !== (server.welcomeChannelId ?? '') ||
    message !== (server.welcomeMessage ?? '')

  const handleSave = useCallback(async () => {
    setSaving(true)
    setError(null)
    setSuccess(false)
    try {
      await api.updateServer(server.id, {
        welcomeChannelId: channelId || null,
        welcomeMessage: message || null
      })
      updateServerInList(server.id, {
        welcomeChannelId: channelId || null,
        welcomeMessage: message || null
      })
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (e) {
      setError(e instanceof Error ? e.message : t('welcome.saveFailed'))
    } finally {
      setSaving(false)
    }
  }, [server.id, channelId, message, updateServerInList, t])

  const handleDisable = useCallback(async () => {
    setSaving(true)
    setError(null)
    try {
      await api.updateServer(server.id, {
        welcomeChannelId: null,
        welcomeMessage: null
      })
      updateServerInList(server.id, { welcomeChannelId: null, welcomeMessage: null })
      setChannelId('')
      setMessage('')
    } catch (e) {
      setError(e instanceof Error ? e.message : t('welcome.disableFailed'))
    } finally {
      setSaving(false)
    }
  }, [server.id, updateServerInList, t])

  const previewText = message
    ? message.replace(/\{user\}/g, t('welcome.previewMember')).replace(/\{server\}/g, server.name)
    : ''

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-white">{t('welcome.title')}</h3>
        <p className="mt-1 text-sm text-gray-400">
          {t('welcome.description', { userPlaceholder: '{user}', serverPlaceholder: '{server}' })}
        </p>
      </div>

      {error && <InlineAlert variant="error">{error}</InlineAlert>}
      {success && <InlineAlert variant="success">{t('welcome.saved')}</InlineAlert>}

      <div className="space-y-4">
        <Select
          label={t('welcome.channelLabel')}
          value={channelId}
          onChange={(e) => setChannelId(e.target.value)}
        >
          <option value="">{t('welcome.channelDisabled')}</option>
          {textChannels.map((ch) => (
            <option key={ch.id} value={ch.id}>#{ch.name}</option>
          ))}
        </Select>

        <Textarea
          id="welcome-message"
          label={t('welcome.messageLabel')}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={t('welcome.messagePlaceholder', { userPlaceholder: '{user}', serverPlaceholder: '{server}' })}
          rows={3}
          maxLength={2000}
        />

        {previewText && (
          <div>
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">{t('welcome.preview')}</span>
            <div className="mt-1.5 rounded-md bg-surface-darkest px-3 py-2.5 text-sm text-gray-300">
              {previewText}
            </div>
          </div>
        )}
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
        {(server.welcomeChannelId || server.welcomeMessage) && (
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
