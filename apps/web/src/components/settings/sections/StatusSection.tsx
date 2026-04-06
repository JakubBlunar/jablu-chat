import { useState } from 'react'
import { StatusPickerCore } from '@/components/user/StatusPickerCore'
import { useAuthStore } from '@/stores/auth.store'

export function StatusSection() {
  const user = useAuthStore((s) => s.user)
  const updateCustomStatus = useAuthStore((s) => s.updateCustomStatus)
  const [customText, setCustomText] = useState(user?.customStatus ?? '')
  const [savingCustom, setSavingCustom] = useState(false)

  const handleCustomStatusSave = async () => {
    setSavingCustom(true)
    try {
      await updateCustomStatus(customText.trim() || null)
    } catch {
      // ignore
    } finally {
      setSavingCustom(false)
    }
  }

  const handleCustomStatusClear = async () => {
    setCustomText('')
    setSavingCustom(true)
    try {
      await updateCustomStatus(null)
    } catch {
      // ignore
    } finally {
      setSavingCustom(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">Custom Status</label>
        <p className="text-sm text-gray-400">Set a custom message visible to other members.</p>
        <div className="flex gap-2">
          <input
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            maxLength={128}
            placeholder="Playing a game, In a meeting..."
            className="flex-1 rounded-md border border-white/10 bg-surface-darkest px-3 py-2 text-sm text-white outline-none focus:border-primary"
          />
          <button
            type="button"
            disabled={savingCustom || customText.trim() === (user?.customStatus ?? '')}
            onClick={() => void handleCustomStatusSave()}
            className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-text transition hover:bg-primary-hover disabled:opacity-50"
          >
            {savingCustom ? '...' : 'Save'}
          </button>
          {user?.customStatus && (
            <button
              type="button"
              disabled={savingCustom}
              onClick={() => void handleCustomStatusClear()}
              className="rounded-md px-3 py-2 text-sm font-medium text-red-400 transition hover:bg-red-500/10 disabled:opacity-50"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">Online Status</label>
        <StatusPickerCore variant="default" />
      </div>
    </div>
  )
}
