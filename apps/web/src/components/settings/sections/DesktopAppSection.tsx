import { useEffect, useState } from 'react'
import { electronAPI } from '@/lib/electron'

export function DesktopAppSection() {
  const [autoLaunch, setAutoLaunch] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    electronAPI
      ?.getAutoLaunch()
      .then((v) => setAutoLaunch(v))
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

  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-3 text-sm font-semibold text-gray-200">Startup</h3>
        <button
          type="button"
          disabled={loading}
          onClick={() => void handleToggle()}
          className="flex w-full items-center gap-3 rounded-md bg-surface-darkest px-4 py-3 transition hover:bg-white/5"
        >
          <div
            className={`relative h-6 w-11 shrink-0 rounded-full transition ${autoLaunch ? 'bg-primary' : 'bg-white/10'}`}
          >
            <div
              className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                autoLaunch ? 'translate-x-5' : ''
              }`}
            />
          </div>
          <div className="text-left">
            <span className="block text-sm text-gray-200">Start at login</span>
            <span className="block text-[11px] text-gray-500">
              Automatically start Jablu when you log in to your computer
            </span>
          </div>
        </button>
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
