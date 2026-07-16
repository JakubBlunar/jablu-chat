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
  const [readyVersion, setReadyVersion] = useState<string | null>(null)
  const [installing, setInstalling] = useState(false)
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
        setStatus(`Update ${info.version} ready`)
        setReadyVersion(info.version)
      }),
      electronAPI.onUpdateError((err) => {
        setChecking(false)
        setInstalling(false)
        setError(err.message)
        setStatus(null)
      })
    ]
    return () => unsubs.forEach((fn) => fn())
  }, [])

  const handleInstall = () => {
    setInstalling(true)
    setError(null)
    // On success the app installs the update and relaunches, so this never resolves;
    // only surface a failure so the user isn't stuck on a spinner.
    electronAPI?.installUpdate().catch((e: unknown) => {
      setInstalling(false)
      setError(e instanceof Error ? e.message : 'Failed to install update')
    })
  }

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
      {readyVersion ? (
        <button
          type="button"
          onClick={handleInstall}
          disabled={installing}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-text transition hover:bg-primary-hover disabled:opacity-50"
        >
          {installing ? 'Restarting...' : `Restart & Update to ${readyVersion}`}
        </button>
      ) : (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleCheck}
            disabled={checking}
            className="text-xs text-gray-400 transition hover:text-white disabled:opacity-50"
          >
            {checking ? 'Checking...' : 'Check for updates'}
          </button>
          <span className="text-gray-700">·</span>
          <button
            type="button"
            onClick={() => void electronAPI?.restartApp()}
            className="text-xs text-gray-400 transition hover:text-white"
          >
            Restart app
          </button>
        </div>
      )}
      {status && <p className="text-[11px] text-gray-400">{status}</p>}
      {error && <p className="text-[11px] text-red-400">Update error: {error}</p>}
      {lastCheckedAt && !checking && !status && !readyVersion && (
        <p className="text-[11px] text-gray-600">Last checked {formatRelativeTime(lastCheckedAt)}</p>
      )}
    </div>
  )
}
