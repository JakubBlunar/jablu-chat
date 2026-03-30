import { useCallback, useState } from 'react'
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

        <label className="block text-xs font-semibold uppercase tracking-wide text-gray-400">
          Welcome Message
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Welcome {user} to {server}! 🎉"
            rows={3}
            maxLength={2000}
            className="mt-1.5 w-full resize-none rounded-md border-0 bg-surface-darkest px-3 py-2.5 text-sm text-white outline-none ring-1 ring-white/10 transition placeholder:text-gray-500 focus:ring-2 focus:ring-primary"
          />
        </label>

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
        <button
          type="button"
          disabled={saving || !hasChanges}
          onClick={() => void handleSave()}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-text transition hover:bg-primary-hover disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        {(server.welcomeChannelId || server.welcomeMessage) && (
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleDisable()}
            className="rounded-md px-4 py-2 text-sm font-medium text-gray-400 transition hover:bg-white/5 hover:text-white disabled:opacity-50"
          >
            Disable
          </button>
        )}
      </div>
    </div>
  )
}
