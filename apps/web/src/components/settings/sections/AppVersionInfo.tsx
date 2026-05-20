import { useEffect, useState } from 'react'
import { electronAPI } from '@/lib/electron'

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`
  return `${Math.round(diff / 86_400_000)}d ago`
}

export function AppVersionInfo() {
  const [checking, setChecking] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lastCheckedAt, setLastCheckedAt] = useState<number | null>(null)
  const [, forceRerender] = useState(0)

  useEffect(() => {
    if (!electronAPI) return

    void electronAPI.getUpdateStatus().then((s) => {
      setLastCheckedAt(s.lastCheckedAt)
      if (s.lastError) setError(s.lastError)
    })

    const unsubs = [
      electronAPI.onUpdateAvailable((info) => {
        setChecking(false)
        setError(null)
        setLastCheckedAt(Date.now())
        setStatus(`Update ${info.version} available, downloading...`)
      }),
      electronAPI.onUpdateNotAvailable(() => {
        setChecking(false)
        setError(null)
        setLastCheckedAt(Date.now())
        setStatus("You're up to date!")
        setTimeout(() => setStatus(null), 3000)
      }),
      electronAPI.onUpdateDownloaded((info) => {
        setStatus(`Update ${info.version} ready — restart to install`)
      }),
      electronAPI.onUpdateError((err) => {
        setChecking(false)
        setError(err.message)
        setStatus(null)
      })
    ]
    return () => unsubs.forEach((fn) => fn())
  }, [])

  useEffect(() => {
    if (!lastCheckedAt) return
    const interval = setInterval(() => forceRerender((n) => n + 1), 60_000)
    return () => clearInterval(interval)
  }, [lastCheckedAt])

  const handleCheck = () => {
    setChecking(true)
    setStatus(null)
    setError(null)
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
      {error && <p className="text-[11px] text-red-400">Update error: {error}</p>}
      {lastCheckedAt && !checking && !status && (
        <p className="text-[11px] text-gray-600">Last checked {formatRelativeTime(lastCheckedAt)}</p>
      )}
    </div>
  )
}
