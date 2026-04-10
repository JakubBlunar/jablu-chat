import { useCallback, useEffect, useMemo, useState } from 'react'
import { ToggleRow } from '@/components/settings/ToggleRow'
import { Button, Input } from '@/components/ui'
import { useAuthStore } from '@/stores/auth.store'

const DEFAULT_START = 22 * 60
const DEFAULT_END = 8 * 60

function minutesToTimeValue(m: number): string {
  const h = Math.min(23, Math.max(0, Math.floor(m / 60)))
  const min = Math.min(59, Math.max(0, m % 60))
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

function timeValueToMinutes(s: string): number {
  const [a, b] = s.split(':')
  const h = parseInt(a ?? '0', 10)
  const min = parseInt(b ?? '0', 10)
  if (!Number.isFinite(h) || !Number.isFinite(min)) return 0
  return Math.min(1439, Math.max(0, h * 60 + min))
}

function useTimeZoneOptions(): string[] {
  return useMemo(() => {
    try {
      const fn = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf
      return fn ? fn.call(Intl, 'timeZone') : ['UTC']
    } catch {
      return ['UTC']
    }
  }, [])
}

/**
 * Server-side push delivery rules (silence all, quiet hours). Same UI for mobile and desktop — only the settings shell differs.
 */
export function PushDeliverySettings() {
  const user = useAuthStore((s) => s.user)
  const updatePushPrefs = useAuthStore((s) => s.updatePushPrefs)
  const zones = useTimeZoneOptions()

  const [suppressAll, setSuppressAll] = useState(false)
  const [quietEnabled, setQuietEnabled] = useState(false)
  const [tz, setTz] = useState('UTC')
  const [startTime, setStartTime] = useState(() => minutesToTimeValue(DEFAULT_START))
  const [endTime, setEndTime] = useState(() => minutesToTimeValue(DEFAULT_END))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    setSuppressAll(user.pushSuppressAll ?? false)
    setQuietEnabled(user.pushQuietHoursEnabled ?? false)
    setTz(user.pushQuietHoursTz?.trim() || 'UTC')
    setStartTime(minutesToTimeValue(user.pushQuietHoursStartMin ?? DEFAULT_START))
    setEndTime(minutesToTimeValue(user.pushQuietHoursEndMin ?? DEFAULT_END))
  }, [
    user?.id,
    user?.pushSuppressAll,
    user?.pushQuietHoursEnabled,
    user?.pushQuietHoursTz,
    user?.pushQuietHoursStartMin,
    user?.pushQuietHoursEndMin
  ])

  const save = useCallback(async () => {
    if (!user) return
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      await updatePushPrefs({
        pushSuppressAll: suppressAll,
        pushQuietHoursEnabled: suppressAll ? false : quietEnabled,
        pushQuietHoursTz: suppressAll || !quietEnabled ? null : tz.trim() || 'UTC',
        pushQuietHoursStartMin: timeValueToMinutes(startTime),
        pushQuietHoursEndMin: timeValueToMinutes(endTime)
      })
      setSuccess('Push preferences saved')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }, [user, suppressAll, quietEnabled, tz, startTime, endTime, updatePushPrefs])

  if (!user) return null

  return (
    <div className="space-y-4 rounded-lg bg-surface-dark p-4">
      <h3 className="text-sm font-semibold text-gray-200">Push delivery (server)</h3>
      <p className="text-xs text-gray-500">
        Control when Jablu is allowed to send web push to your devices. Channel mute and mentions-only settings still apply.
      </p>

      <ToggleRow
        label="Silence all push"
        description="Never send web push notifications to your account"
        checked={suppressAll}
        onChange={() =>
          setSuppressAll((v) => {
            const next = !v
            if (next) setQuietEnabled(false)
            return next
          })
        }
      />

      <ToggleRow
        label="Quiet hours"
        description="No web push during a daily window in your chosen timezone"
        checked={quietEnabled}
        onChange={() => setQuietEnabled((v) => !v)}
        disabled={suppressAll}
      />

      {quietEnabled && !suppressAll && (
        <div className="space-y-3 border-t border-white/10 pt-3">
          <div>
            <label htmlFor="push-tz" className="mb-1 block text-xs font-medium text-gray-400">
              Timezone
            </label>
            <Input
              id="push-tz"
              list="jablu-tz-options"
              value={tz}
              onChange={(e) => setTz(e.target.value)}
              placeholder="e.g. Europe/Prague"
              className="w-full"
              autoComplete="off"
            />
            <datalist id="jablu-tz-options">
              {zones.map((z) => (
                <option key={z} value={z} />
              ))}
            </datalist>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label htmlFor="push-start" className="mb-1 block text-xs font-medium text-gray-400">
                From
              </label>
              <input
                id="push-start"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full rounded-md border border-white/10 bg-surface-darkest px-3 py-2 text-sm text-white"
              />
            </div>
            <div className="flex-1">
              <label htmlFor="push-end" className="mb-1 block text-xs font-medium text-gray-400">
                To
              </label>
              <input
                id="push-end"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full rounded-md border border-white/10 bg-surface-darkest px-3 py-2 text-sm text-white"
              />
            </div>
          </div>
          <p className="text-xs text-gray-500">
            Uses the selected timezone. Overnight windows work (for example 22:00 to 08:00).
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="primary" disabled={saving} onClick={() => void save()}>
          {saving ? 'Saving…' : 'Save push preferences'}
        </Button>
        {success && <span className="text-xs text-green-400">{success}</span>}
        {error && <span className="text-xs text-red-400">{error}</span>}
      </div>
    </div>
  )
}
