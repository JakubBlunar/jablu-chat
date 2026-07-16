import { useEffect, useState } from 'react'
import { Toggle } from '@/components/ui/Toggle'
import { electronAPI } from '@/lib/electron'

export function DesktopAppSection() {
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
        <h3 className="mb-3 text-sm font-semibold text-gray-200">Startup</h3>
        <div className="space-y-2">
          <div
            onClick={() => { if (!loading) void handleToggle() }}
            className="flex w-full cursor-pointer items-center gap-3 rounded-md bg-surface-darkest px-4 py-3 transition hover:bg-white/5"
          >
            <Toggle checked={autoLaunch} onChange={() => void handleToggle()} disabled={loading} />
            <div className="text-left">
              <span className="block text-sm text-gray-200">Start at login</span>
              <span className="block text-[11px] text-gray-500">
                Automatically start Jablu when you log in to your computer
              </span>
            </div>
          </div>

          <div
            onClick={() => { if (!loading && autoLaunch) void handleToggleMinimized() }}
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
              <span className="block text-sm text-gray-200">Start minimized to tray</span>
              <span className="block text-[11px] text-gray-500">
                When launched at login, start hidden in the tray. Jablu stays connected and
                still shows notifications.
              </span>
            </div>
          </div>
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-gray-200">System Tray</h3>
        <div className="rounded-md bg-surface-darkest px-4 py-3">
          <p className="text-sm text-gray-300">
            Jablu minimizes to the system tray when you close the window.
          </p>
          <p className="mt-1 text-[11px] text-gray-500">
            Double-click the tray icon to reopen. Right-click for options including Quit.
          </p>
        </div>
      </div>
    </div>
  )
}
