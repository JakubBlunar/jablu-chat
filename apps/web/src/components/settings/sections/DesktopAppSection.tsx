import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ToggleRow } from '../ToggleRow'
import { electronAPI } from '@/lib/electron'

function useNativePreference(read: () => Promise<boolean>, write: (value: boolean) => Promise<boolean>) {
  const [value, setValue] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(true)
  const [failure, setFailure] = useState<boolean | 'read' | null>(null)
  useEffect(() => {
    let active = true
    read()
      .then((result) => {
        if (active) setValue(result)
      })
      .catch(() => {
        if (active) setFailure('read')
      })
      .finally(() => {
        if (active) setBusy(false)
      })
    return () => {
      active = false
    }
  }, [read])
  const apply = async (desired: boolean | 'read') => {
    setBusy(true)
    setFailure(null)
    try {
      const confirmed = await (desired === 'read' ? read() : write(desired))
      setValue(confirmed)
      if (typeof desired === 'boolean' && desired !== confirmed) setFailure(desired)
    } catch {
      setFailure(desired)
    } finally {
      setBusy(false)
    }
  }
  return { value, busy, failure, apply }
}

const readLaunch = async () => electronAPI!.getAutoLaunch()
const readMinimized = async () => electronAPI!.getStartMinimized()
const writeLaunch = async (next: boolean) => electronAPI!.setAutoLaunch(next)
const writeMinimized = async (next: boolean) => {
  await electronAPI!.setStartMinimized(next)
  return readMinimized()
}

export function DesktopAppSection() {
  const { t } = useTranslation('settings')
  const { t: common } = useTranslation('common')
  const launch = useNativePreference(readLaunch, writeLaunch)
  const minimized = useNativePreference(readMinimized, writeMinimized)
  function preference(pref: typeof launch, key: string, disabled = false) {
    return (
      <div aria-busy={pref.busy}>
        <ToggleRow
          label={t('desktop.' + key)}
          description={t('desktop.' + key + 'Description')}
          checked={pref.value === true}
          disabled={disabled || pref.busy || pref.value === null}
          onChange={(next) => void pref.apply(next)}
        />
        {pref.busy && (
          <p role="status" className="text-xs">
            {common('loading')}
          </p>
        )}
        {pref.failure !== null && (
          <p role="alert" className="text-sm">
            {t('nativePreferenceFailed')}{' '}
            <button disabled={disabled} onClick={() => void pref.apply(pref.failure!)}>
              {common('retry')}
            </button>
          </p>
        )}
      </div>
    )
  }
  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-3 text-sm font-semibold text-gray-200">{t('desktop.startup')}</h3>
        <div className="space-y-2">
          {preference(launch, 'startAtLogin')}
          {preference(minimized, 'startMinimized', launch.value !== true || launch.busy)}
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-gray-200">{t('desktop.systemTray')}</h3>
        <div className="rounded-md bg-surface-darkest px-4 py-3">
          <p className="text-sm text-gray-300">{t('desktop.systemTrayDescription')}</p>
          <p className="mt-1 text-[11px] text-gray-500">{t('desktop.systemTrayOptions')}</p>
        </div>
      </div>
    </div>
  )
}
