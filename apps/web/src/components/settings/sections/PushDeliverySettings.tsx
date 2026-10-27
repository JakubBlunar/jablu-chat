import { ToggleRow } from '@/components/settings/ToggleRow'
import { Button } from '@/components/ui'
import { inputFieldClassNames } from '@/components/ui/Input'
import { useTimeZoneOptions } from '@/hooks/useTimeZoneOptions'
import { cn } from '@/lib/cn'
import { minutesToTimeValue, timeValueToMinutes } from '@/lib/pushDeliveryTime'
import { useAuthStore } from '@/stores/auth.store'
import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

/** Native time controls: dark scheme + visible clock icon on dark backgrounds (esp. WebKit). */
const timeFieldClass = cn(
  inputFieldClassNames,
  'scheme-dark [color-scheme:dark]',
  '[&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-90 [&::-webkit-calendar-picker-indicator]:invert'
)

const DEFAULT_START = 22 * 60
const DEFAULT_END = 8 * 60

/**
 * Server-side push delivery rules (silence all, quiet hours). Same UI for mobile and desktop — only the settings shell differs.
 */
export function PushDeliverySettings() {
  const { t } = useTranslation('settings')
  const tzFieldId = useId()
  const user = useAuthStore((s) => s.user)
  const updatePushPrefs = useAuthStore((s) => s.updatePushPrefs)
  const zones = useTimeZoneOptions()
  const sortedZones = useMemo(() => [...zones].sort((a, b) => a.localeCompare(b)), [zones])

  const [suppressAll, setSuppressAll] = useState(false)
  const [quietEnabled, setQuietEnabled] = useState(false)
  const [tz, setTz] = useState('UTC')
  const [startTime, setStartTime] = useState(() => minutesToTimeValue(DEFAULT_START))
  const [endTime, setEndTime] = useState(() => minutesToTimeValue(DEFAULT_END))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const {
    id: userId,
    pushSuppressAll,
    pushQuietHoursEnabled,
    pushQuietHoursTz,
    pushQuietHoursStartMin,
    pushQuietHoursEndMin
  } = user ?? {}

  useEffect(() => {
    if (!userId) return
    setSuppressAll(pushSuppressAll ?? false)
    setQuietEnabled(pushQuietHoursEnabled ?? false)
    setTz(pushQuietHoursTz?.trim() || 'UTC')
    setStartTime(minutesToTimeValue(pushQuietHoursStartMin ?? DEFAULT_START))
    setEndTime(minutesToTimeValue(pushQuietHoursEndMin ?? DEFAULT_END))
  }, [userId, pushSuppressAll, pushQuietHoursEnabled, pushQuietHoursTz, pushQuietHoursStartMin, pushQuietHoursEndMin])

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
      setSuccess(t('pushDelivery.saved'))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t('pushDelivery.saveFailed'))
    } finally {
      setSaving(false)
    }
  }, [user, suppressAll, quietEnabled, tz, startTime, endTime, updatePushPrefs, t])

  if (!user) return null

  return (
    <div className="space-y-4 rounded-lg bg-surface-dark p-4">
      <h3 className="text-sm font-semibold text-gray-200">{t('pushDelivery.title')}</h3>
      <p className="text-xs text-gray-500">{t('pushDelivery.description')}</p>

      <ToggleRow
        label={t('pushDelivery.silenceAll')}
        description={t('pushDelivery.silenceAllDescription')}
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
        label={t('pushDelivery.quietHours')}
        description={t('pushDelivery.quietHoursDescription')}
        checked={quietEnabled}
        onChange={() => setQuietEnabled((v) => !v)}
        disabled={suppressAll}
      />

      {quietEnabled && !suppressAll && (
        <div className="space-y-3 border-t border-white/10 pt-3">
          <div>
            <label htmlFor={tzFieldId} className="mb-1 block text-xs font-medium text-gray-400">
              {t('pushDelivery.timezone')}
            </label>
            {/* Native <select> so the menu is not clipped inside settings scroll (SimpleBar); datalist often fails there. */}
            <select
              id={tzFieldId}
              value={tz}
              onChange={(e) => setTz(e.target.value)}
              className={cn(inputFieldClassNames, 'w-full cursor-pointer')}
            >
              {!sortedZones.includes(tz) && tz ? (
                <option value={tz}>{t('pushDelivery.timezoneUnlisted', { zone: tz })}</option>
              ) : null}
              {sortedZones.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label htmlFor="push-start" className="mb-1 block text-xs font-medium text-gray-400">
                {t('pushDelivery.from')}
              </label>
              <input
                id="push-start"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className={cn(timeFieldClass, 'w-full')}
              />
            </div>
            <div className="flex-1">
              <label htmlFor="push-end" className="mb-1 block text-xs font-medium text-gray-400">
                {t('pushDelivery.to')}
              </label>
              <input
                id="push-end"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className={cn(timeFieldClass, 'w-full')}
              />
            </div>
          </div>
          <p className="text-xs text-gray-500">{t('pushDelivery.overnightHint')}</p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="primary" disabled={saving} onClick={() => void save()}>
          {saving ? t('pushDelivery.saving') : t('pushDelivery.save')}
        </Button>
        {success && <span className="text-xs text-green-400">{success}</span>}
        {error && <span className="text-xs text-red-400">{error}</span>}
      </div>
    </div>
  )
}
