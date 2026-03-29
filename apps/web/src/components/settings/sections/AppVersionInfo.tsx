import { useEffect, useState } from 'react'
import { electronAPI } from '@/lib/electron'

export function AppVersionInfo() {
  const [checking, setChecking] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  useEffect(() => {
    if (!electronAPI) return
    const unsubs = [
      electronAPI.onUpdateAvailable((info) => {
        setChecking(false)
        setStatus(`Update ${info.version} available, downloading...`)
      }),
      electronAPI.onUpdateNotAvailable(() => {
        setChecking(false)
        setStatus("You're up to date!")
        setTimeout(() => setStatus(null), 3000)
      }),
      electronAPI.onUpdateDownloaded((info) => {
        setStatus(`Update ${info.version} ready — restart to install`)
      }),
      electronAPI.onUpdateError(() => {
        setChecking(false)
        setStatus('Update check failed')
        setTimeout(() => setStatus(null), 3000)
      })
    ]
    return () => unsubs.forEach((fn) => fn())
  }, [])

  const handleCheck = () => {
    setChecking(true)
    setStatus(null)
    electronAPI?.checkForUpdates().catch(() => setChecking(false))
  }

  return (
    <div className="space-y-1.5">
      <p className="text-[11px] text-gray-500">Jablu v{electronAPI?.appVersion ?? '?'}</p>
      <button
        type="button"
        onClick={handleCheck}
        disabled={checking}
        className="text-xs text-gray-400 transition hover:text-white disabled:opacity-50"
      >
        {checking ? 'Checking...' : 'Check for updates'}
      </button>
      {status && <p className="text-[11px] text-gray-400">{status}</p>}
    </div>
  )
}
