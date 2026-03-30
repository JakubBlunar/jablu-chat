import { useCallback, useState } from 'react'
import { Button } from '@/components/ui'
import { api } from '@/lib/api'
import { useChannelStore } from '@/stores/channel.store'
import { useServerStore } from '@/stores/server.store'
import type { Server } from '@/stores/server.store'

const TIMEOUT_OPTIONS = [
  { value: 60, label: '1 minute' },
  { value: 300, label: '5 minutes' },
  { value: 600, label: '10 minutes' },
  { value: 900, label: '15 minutes' },
  { value: 1800, label: '30 minutes' },
  { value: 3600, label: '1 hour' }
]

export function AfkTab({ server }: { server: Server }) {
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
      setError(e instanceof Error ? e.message : 'Failed to save AFK settings')
    } finally {
      setSaving(false)
    }
  }, [server.id, channelId, timeout, updateServerInList])

  const handleDisable = useCallback(async () => {
    setSaving(true)
    setError(null)
    try {
      await api.updateServer(server.id, { afkChannelId: null })
      updateServerInList(server.id, { afkChannelId: null })
      setChannelId('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to disable AFK channel')
    } finally {
      setSaving(false)
    }
  }, [server.id, updateServerInList])

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-white">AFK Voice Channel</h3>
        <p className="mt-1 text-sm text-gray-400">
          Automatically move idle voice users to a designated AFK channel after a period of inactivity.
        </p>
      </div>

      {error && <div className="rounded bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</div>}
      {success && <div className="rounded bg-green-500/10 px-3 py-2 text-xs text-green-400">AFK settings saved!</div>}

      <div className="space-y-4">
        <label className="block text-xs font-semibold uppercase tracking-wide text-gray-400">
          AFK Channel
          <select
            value={channelId}
            onChange={(e) => setChannelId(e.target.value)}
            className="mt-1.5 w-full rounded-md border-0 bg-surface-darkest px-3 py-2.5 text-sm text-white outline-none ring-1 ring-white/10 transition focus:ring-2 focus:ring-primary"
          >
            <option value="">Disabled — no AFK channel</option>
            {voiceChannels.map((ch) => (
              <option key={ch.id} value={ch.id}>🔊 {ch.name}</option>
            ))}
          </select>
        </label>

        <label className="block text-xs font-semibold uppercase tracking-wide text-gray-400">
          AFK Timeout
          <select
            value={timeout}
            onChange={(e) => setTimeout_(Number(e.target.value))}
            className="mt-1.5 w-full rounded-md border-0 bg-surface-darkest px-3 py-2.5 text-sm text-white outline-none ring-1 ring-white/10 transition focus:ring-2 focus:ring-primary"
          >
            {TIMEOUT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </label>
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
        {server.afkChannelId && (
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
