import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Toggle } from '@/components/ui/Toggle'
import { electronAPI } from '@/lib/electron'

export function DesktopAppSection() {
  const { t } = useTranslation('settings')
  const [autoLaunch, setAutoLaunch] = useState(false)
  const [startMinimized, setStartMinimized] = useState(true)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!electronAPI) {
      setLoading(false)
      return
    }
    void Promise.all([
      electronAPI.getAutoLaunch().then((v) => setAutoLaunch(v)),
      electronAPI.getStartMinimized().then((v) => setStartMinimized(v))
    ])
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const handleToggle = async () => {
    if (!electronAPI) return
    const next = !autoLaunch
    try {
      const result = await electronAPI.setAutoLaunch(next)
      setAutoLaunch(result)
    } catch {
      /* ignore */
    }
  }

  const handleToggleMinimized = async () => {
    if (!electronAPI) return
    const next = !startMinimized
    setStartMinimized(next)
    try {
      await electronAPI.setStartMinimized(next)
    } catch {
      setStartMinimized(!next)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-3 text-sm font-semibold text-gray-200">{t('desktop.startup')}</h3>
        <div className="space-y-2">
          <div
            onClick={() => {
              if (!loading) void handleToggle()
            }}
            className="flex w-full cursor-pointer items-center gap-3 rounded-md bg-surface-darkest px-4 py-3 transition hover:bg-white/5"
          >
            <Toggle checked={autoLaunch} onChange={() => void handleToggle()} disabled={loading} />
            <div className="text-left">
              <span className="block text-sm text-gray-200">{t('desktop.startAtLogin')}</span>
              <span className="block text-[11px] text-gray-500">{t('desktop.startAtLoginDescription')}</span>
            </div>
          </div>

          <div
            onClick={() => {
              if (!loading && autoLaunch) void handleToggleMinimized()
            }}
            className={`flex w-full items-center gap-3 rounded-md bg-surface-darkest px-4 py-3 transition ${
              autoLaunch ? 'cursor-pointer hover:bg-white/5' : 'cursor-not-allowed opacity-50'
            }`}
          >
            <Toggle
              checked={startMinimized}
              onChange={() => void handleToggleMinimized()}
              disabled={loading || !autoLaunch}
            />
            <div className="text-left">
              <span className="block text-sm text-gray-200">{t('desktop.startMinimized')}</span>
              <span className="block text-[11px] text-gray-500">{t('desktop.startMinimizedDescription')}</span>
            </div>
          </div>
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
