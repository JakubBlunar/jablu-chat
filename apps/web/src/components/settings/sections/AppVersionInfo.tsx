import { useEffect, useRef, useState } from 'react'
import { electronAPI } from '@/lib/electron'
import { useDesktopUpdateStore } from '@/stores/desktopUpdate.store'

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`
  return `${Math.round(diff / 86_400_000)}d ago`
}

export function AppVersionInfo() {
  const state = useDesktopUpdateStore((s) => s.state)
  const lastCheckedAt = useDesktopUpdateStore((s) => s.lastCheckedAt)
  const checking = useDesktopUpdateStore((s) => s.checking)
  const installing = useDesktopUpdateStore((s) => s.installing)
  const check = useDesktopUpdateStore((s) => s.check)
  const install = useDesktopUpdateStore((s) => s.install)
  const [, forceRerender] = useState(0)
  const [upToDate, setUpToDate] = useState(false)
  const wasChecking = useRef(false)

  useEffect(() => {
    if (!lastCheckedAt) return
    const interval = setInterval(() => forceRerender((n) => n + 1), 60_000)
    return () => clearInterval(interval)
  }, [lastCheckedAt])

  useEffect(() => {
    if (wasChecking.current && !checking && state.status === 'idle') {
      setUpToDate(true)
      const t = setTimeout(() => setUpToDate(false), 3000)
      wasChecking.current = checking
      return () => clearTimeout(t)
    }
    wasChecking.current = checking
  }, [checking, state.status])

  const readyVersion = state.status === 'ready' ? state.version : null
  const busy = checking || state.status === 'downloading' || state.status === 'available'
  const statusText = upToDate
    ? "You're up to date!"
    : state.status === 'available'
      ? `Update ${state.version} available, downloading...`
      : state.status === 'downloading'
        ? `Downloading update ${state.version}… ${Math.round(state.percent)}%`
        : state.status === 'ready'
          ? `Update ${state.version} ready`
          : null
  const error = state.status === 'error' ? state.message : null

  return (
    <div className="space-y-1.5">
      <p className="text-[11px] text-gray-500">Jablu v{electronAPI?.appVersion ?? '?'}</p>
      {readyVersion ? (
        <button
          type="button"
          onClick={() => void install()}
          disabled={installing}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-text transition hover:bg-primary-hover disabled:opacity-50"
        >
          {installing ? 'Restarting...' : `Restart & Update to ${readyVersion}`}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => void check()}
          disabled={busy}
          className="text-xs text-gray-400 transition hover:text-white disabled:opacity-50"
        >
          {busy ? 'Checking...' : 'Check for updates'}
        </button>
      )}
      {statusText && <p className="text-[11px] text-gray-400">{statusText}</p>}
      {error && <p className="text-[11px] text-red-400">Update error: {error}</p>}
      {lastCheckedAt && !checking && !statusText && !readyVersion && (
        <p className="text-[11px] text-gray-600">Last checked {formatRelativeTime(lastCheckedAt)}</p>
      )}
    </div>
  )
}
