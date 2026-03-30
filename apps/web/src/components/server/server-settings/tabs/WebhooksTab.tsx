import { useCallback, useEffect, useState } from 'react'
import { Button, Input } from '@/components/ui'
import { api } from '@/lib/api'
import { useChannelStore } from '@/stores/channel.store'
import type { Server } from '@/stores/server.store'
import type { WebhookItem } from '../serverSettingsTypes'
import { TrashIcon } from '../serverSettingsIcons'

export function WebhooksTab({ server: _server }: { server: Server }) {
  const channels = useChannelStore((s) => s.channels)
  const textChannels = channels.filter((c) => c.type === 'text')
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
      setWebhookError('Failed to create webhook')
    } finally {
      setCreating(false)
    }
  }, [name, channelId, fetchWebhooks])

  const handleDelete = useCallback(async (id: string) => {
    setWebhookError(null)
    try {
      await api.deleteWebhook(id)
      setWebhooks((prev) => prev.filter((w) => w.id !== id))
    } catch {
      setWebhookError('Failed to delete webhook')
    }
  }, [])

  const copyUrl = useCallback((wh: WebhookItem) => {
    const base = window.location.origin
    const url = `${base}/api/webhooks/${wh.token}/execute`
    void navigator.clipboard.writeText(url)
    setCopiedId(wh.id)
    setTimeout(() => setCopiedId(null), 2000)
  }, [])

  if (loading) {
    return <p className="text-sm text-gray-400">Loading…</p>
  }

  return (
    <div className="space-y-6">
      {webhookError && (
        <div className="rounded bg-red-500/10 px-3 py-2 text-xs text-red-400">{webhookError}</div>
      )}
      <div className="rounded-md bg-surface-dark p-4">
        <h3 className="mb-3 text-sm font-semibold text-white">Create Webhook</h3>
        <div className="flex items-end gap-3">
          <div className="min-w-0 flex-1">
            <Input
              id="webhook-name"
              label="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              placeholder="My Webhook"
            />
          </div>
          <div className="w-40 space-y-1">
            <label className="text-xs text-gray-400">Channel</label>
            <select
              value={channelId}
              onChange={(e) => setChannelId(e.target.value)}
              className="w-full rounded border border-white/10 bg-surface-darkest px-2 py-2 text-sm text-white outline-none"
            >
              {textChannels.map((ch) => (
                <option key={ch.id} value={ch.id}>
                  #{ch.name}
                </option>
              ))}
            </select>
          </div>
          <Button
            type="button"
            disabled={!name.trim()}
            loading={creating}
            onClick={() => void handleCreate()}
          >
            Create
          </Button>
        </div>
      </div>

      {webhooks.length === 0 ? (
        <p className="text-center text-sm text-gray-500">No webhooks yet.</p>
      ) : (
        <div className="space-y-2">
          {webhooks.map((wh) => {
            const ch = channels.find((c) => c.id === wh.channelId)
            return (
              <div key={wh.id} className="flex items-center gap-3 rounded-md bg-surface-dark px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white">{wh.name}</p>
                  <p className="text-xs text-gray-500">
                    #{ch?.name ?? 'unknown'} &middot; {new Date(wh.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() => copyUrl(wh)}
                  className="text-xs font-medium text-primary"
                >
                  {copiedId === wh.id ? 'Copied!' : 'Copy URL'}
                </Button>
                <button
                  type="button"
                  onClick={() => void handleDelete(wh.id)}
                  className="rounded p-1 text-red-400 transition hover:bg-red-500/20"
                  title="Delete webhook"
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
