import type { UserStatus } from '@chat/shared'
import { useState } from 'react'
import { STATUS_OPTIONS } from '@/components/settings/settingsTypes'
import { useAuthStore } from '@/stores/auth.store'

export function StatusSection() {
  const user = useAuthStore((s) => s.user)
  const updateStatus = useAuthStore((s) => s.updateStatus)
  const updateCustomStatus = useAuthStore((s) => s.updateCustomStatus)
  const [loading, setLoading] = useState<UserStatus | null>(null)
  const [customText, setCustomText] = useState(user?.customStatus ?? '')
  const [savingCustom, setSavingCustom] = useState(false)

  const currentStatus = user?.status ?? 'online'

  const handleChange = async (status: UserStatus) => {
    setLoading(status)
    try {
      await updateStatus(status)
    } catch {
      // ignore
    } finally {
      setLoading(null)
    }
  }

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
            className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-white transition hover:bg-primary-hover disabled:opacity-50"
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
        <p className="text-sm text-gray-400">Choose how others see you in the member list.</p>
        <div className="space-y-1">
          {STATUS_OPTIONS.map((opt) => {
            const active = currentStatus === opt.value
            return (
              <button
                key={opt.value}
                type="button"
                disabled={loading !== null}
                onClick={() => handleChange(opt.value)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition ${
                  active ? 'bg-white/10 text-white' : 'text-gray-300 hover:bg-white/[0.06] hover:text-white'
                }`}
              >
                <span className={`inline-block h-3 w-3 rounded-full ${opt.color}`} />
                <span className="text-sm font-medium">{opt.label}</span>
                {active && <span className="ml-auto text-xs text-gray-400">Current</span>}
                {loading === opt.value && <span className="ml-auto text-xs text-gray-400">...</span>}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
