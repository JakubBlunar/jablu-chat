import { useCallback, useState } from 'react'
import { Button, Textarea } from '@/components/ui'
import { api } from '@/lib/api'
import { useChannelStore } from '@/stores/channel.store'
import { useServerStore } from '@/stores/server.store'
import type { Server } from '@/stores/server.store'

export function WelcomeTab({ server }: { server: Server }) {
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
      setError(e instanceof Error ? e.message : 'Failed to save welcome settings')
    } finally {
      setSaving(false)
    }
  }, [server.id, channelId, message, updateServerInList])

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
      setError(e instanceof Error ? e.message : 'Failed to disable welcome messages')
    } finally {
      setSaving(false)
    }
  }, [server.id, updateServerInList])

  const previewText = message
    ? message.replace(/\{user\}/g, 'NewMember').replace(/\{server\}/g, server.name)
    : ''

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-white">Welcome Messages</h3>
        <p className="mt-1 text-sm text-gray-400">
          Automatically post a message when a new member joins. Use <code className="rounded bg-surface-darkest px-1 text-primary">{'{user}'}</code> and <code className="rounded bg-surface-darkest px-1 text-primary">{'{server}'}</code> as placeholders.
        </p>
      </div>

      {error && <div className="rounded bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</div>}
      {success && <div className="rounded bg-green-500/10 px-3 py-2 text-xs text-green-400">Welcome settings saved!</div>}

      <div className="space-y-4">
        <label className="block text-xs font-semibold uppercase tracking-wide text-gray-400">
          Welcome Channel
          <select
            value={channelId}
            onChange={(e) => setChannelId(e.target.value)}
            className="mt-1.5 w-full rounded-md border-0 bg-surface-darkest px-3 py-2.5 text-sm text-white outline-none ring-1 ring-white/10 transition focus:ring-2 focus:ring-primary"
          >
            <option value="">Disabled — no welcome messages</option>
            {textChannels.map((ch) => (
              <option key={ch.id} value={ch.id}>#{ch.name}</option>
            ))}
          </select>
        </label>

        <Textarea
          id="welcome-message"
          label="Welcome Message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Welcome {user} to {server}! 🎉"
          rows={3}
          maxLength={2000}
        />

        {previewText && (
          <div>
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">Preview</span>
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
          Save
        </Button>
        {(server.welcomeChannelId || server.welcomeMessage) && (
          <Button
            type="button"
            variant="secondary"
            disabled={saving}
            onClick={() => void handleDisable()}
          >
            Disable
          </Button>
        )}
      </div>
    </div>
  )
}
