import { useCallback, useState } from 'react'
import { Button, InlineAlert } from '@/components/ui'
import { api } from '@/lib/api'
import { useServerStore } from '@/stores/server.store'
import type { Server } from '@/stores/server.store'

export function LevelingTab({ server }: { server: Server }) {
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
      setError(e instanceof Error ? e.message : 'Failed to save leveling settings')
    } finally {
      setSaving(false)
    }
  }, [server.id, enabled, updateServerInList])

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-white">Leveling &amp; XP</h3>
        <p className="mt-1 text-sm text-gray-400">
          Reward active members with XP for chatting. Members earn between 15 and 25 XP for each
          message, with a 60-second cooldown to prevent spam. Levels are per-server.
        </p>
      </div>

      {error && <InlineAlert variant="error">{error}</InlineAlert>}
      {success && <InlineAlert variant="success">Leveling settings saved.</InlineAlert>}

      <label className="flex cursor-pointer items-start gap-3 rounded-md border border-white/10 bg-surface-darkest p-4">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-white/20 bg-surface text-primary focus:ring-primary"
        />
        <div className="flex-1">
          <div className="text-sm font-medium text-white">Enable leveling</div>
          <p className="mt-1 text-xs text-gray-400">
            When enabled, members earn XP as they chat and a leaderboard becomes available to
            everyone in this server. Disabling leveling preserves existing XP totals but stops
            awarding new XP and hides the leaderboard.
          </p>
        </div>
      </label>

      <div>
        <Button
          type="button"
          disabled={!hasChanges}
          loading={saving}
          onClick={() => void handleSave()}
        >
          Save
        </Button>
      </div>
    </div>
  )
}
