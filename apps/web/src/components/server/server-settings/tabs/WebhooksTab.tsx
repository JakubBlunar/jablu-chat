import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Input, InlineAlert, Select } from '@/components/ui'
import { api } from '@/lib/api'
import { useChannelStore } from '@/stores/channel.store'
import type { Server } from '@/stores/server.store'
import type { WebhookItem } from '../serverSettingsTypes'
import { TrashIcon } from '../serverSettingsIcons'
import { getAppIntlLocale } from '@/lib/format-time'

export function WebhooksTab({ server: _server }: { server: Server }) {
  const { t } = useTranslation('server-settings')
  const channels = useChannelStore((s) => s.channels)
  const textChannels = useMemo(() => channels.filter((c) => c.type === 'text'), [channels])
  const [webhooks, setWebhooks] = useState<WebhookItem[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [channelId, setChannelId] = useState(textChannels[0]?.id ?? '')
  const [creating, setCreating] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [webhookError, setWebhookError] = useState<string | null>(null)

  const fetchWebhooks = useCallback(async () => {
    const all: WebhookItem[] = []
    for (const ch of textChannels) {
      try {
        const list = await api.getWebhooks(ch.id)
        all.push(...(list as WebhookItem[]))
      } catch {
        /* no access */
      }
    }
    setWebhooks(all)
    setLoading(false)
  }, [textChannels])

  useEffect(() => {
    void fetchWebhooks()
  }, [fetchWebhooks])

  const handleCreate = useCallback(async () => {
    if (!name.trim() || !channelId) return
    setCreating(true)
    setWebhookError(null)
    try {
      await api.createWebhook(channelId, name.trim())
      setName('')
      await fetchWebhooks()
    } catch {
      setWebhookError(t('webhooks.createFailed'))
    } finally {
      setCreating(false)
    }
  }, [name, channelId, fetchWebhooks, t])

  const handleDelete = useCallback(async (id: string) => {
    setWebhookError(null)
    try {
      await api.deleteWebhook(id)
      setWebhooks((prev) => prev.filter((w) => w.id !== id))
    } catch {
      setWebhookError(t('webhooks.deleteFailed'))
    }
  }, [t])

  const copyUrl = useCallback((wh: WebhookItem) => {
    const base = window.location.origin
    const url = `${base}/api/webhooks/${wh.token}/execute`
    void navigator.clipboard.writeText(url)
    setCopiedId(wh.id)
    setTimeout(() => setCopiedId(null), 2000)
  }, [])

  if (loading) {
    return <p className="text-sm text-gray-400">{t('actions.loading')}</p>
  }

  return (
    <div className="space-y-6">
      {webhookError && (
        <InlineAlert variant="error">{webhookError}</InlineAlert>
      )}
      <div className="rounded-md bg-surface-dark p-4">
        <h3 className="mb-3 text-sm font-semibold text-white">{t('webhooks.createTitle')}</h3>
        <div className="flex items-end gap-3">
          <div className="min-w-0 flex-1">
            <Input
              id="webhook-name"
              label={t('webhooks.nameLabel')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              placeholder={t('webhooks.namePlaceholder')}
            />
          </div>
          <div className="w-40">
            <Select
              label={t('webhooks.channelLabel')}
              value={channelId}
              onChange={(e) => setChannelId(e.target.value)}
            >
              {textChannels.map((ch) => (
                <option key={ch.id} value={ch.id}>
                  #{ch.name}
                </option>
              ))}
            </Select>
          </div>
          <Button
            type="button"
            disabled={!name.trim()}
            loading={creating}
            onClick={() => void handleCreate()}
          >
            {t('webhooks.create')}
          </Button>
        </div>
      </div>

      {webhooks.length === 0 ? (
        <p className="text-center text-sm text-gray-500">{t('webhooks.noWebhooks')}</p>
      ) : (
        <div className="space-y-2">
          {webhooks.map((wh) => {
            const ch = channels.find((c) => c.id === wh.channelId)
            return (
              <div key={wh.id} className="flex items-center gap-3 rounded-md bg-surface-dark px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white">{wh.name}</p>
                  <p className="text-xs text-gray-500">
                    #{ch?.name ?? t('webhooks.unknownChannel')} &middot; {new Date(wh.createdAt).toLocaleDateString(getAppIntlLocale())}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() => copyUrl(wh)}
                  className="text-xs font-medium text-primary"
                >
                  {copiedId === wh.id ? t('webhooks.copied') : t('webhooks.copyUrl')}
                </Button>
                <button
                  type="button"
                  onClick={() => void handleDelete(wh.id)}
                  aria-label={t('webhooks.delete')}
                  className="rounded p-1 text-red-400 transition hover:bg-red-500/20"
                  title={t('webhooks.delete')}
                >
                  <TrashIcon />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
