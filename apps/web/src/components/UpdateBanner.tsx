import { useEffect, useState } from 'react'
import { Button, ProgressBar } from '@/components/ui'
import { electronAPI, isElectron } from '@/lib/electron'

type UpdateState =
  | { status: 'idle' }
  | { status: 'available'; version: string }
  | { status: 'downloading'; percent: number }
  | { status: 'ready'; version: string }
  | { status: 'error'; message: string }
  | { status: 'incompatible'; reason: 'client-too-old' | 'client-too-new' | null; minClient: string; maxClient: string | null }

function ElectronUpdateBanner() {
  const [state, setState] = useState<UpdateState>({ status: 'idle' })
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (!electronAPI) return

    const unsubs = [
      electronAPI.onUpdateAvailable((info) => {
        setState({ status: 'available', version: info.version })
        setDismissed(false)
      }),
      electronAPI.onUpdateDownloadProgress((progress) => {
        setState({ status: 'downloading', percent: progress.percent })
      }),
      electronAPI.onUpdateDownloaded((info) => {
        setState({ status: 'ready', version: info.version })
        setDismissed(false)
      }),
      electronAPI.onUpdateError((err) => {
        setState({ status: 'error', message: err.message })
      }),
      electronAPI.onUpdateIncompatible((info) => {
        setState({ status: 'incompatible', reason: info.reason, minClient: info.minClient, maxClient: info.maxClient })
        setDismissed(false)
      })
    ]

    return () => unsubs.forEach((fn) => fn())
  }, [])

  if (dismissed || state.status === 'idle') return null

  const isError = state.status === 'error'
  const isIncompatible = state.status === 'incompatible'
  const isWarn = isError || isIncompatible

  return (
    <div
      className={`flex items-center gap-3 border-b px-4 py-2 text-sm ${
        isWarn ? 'border-red-500/30 bg-red-950/40 text-red-200' : 'border-white/5 bg-surface-raised text-gray-300'
      }`}
    >
      {state.status === 'available' && (
        <>
          <span>A new version ({state.version}) is being downloaded...</span>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="ml-auto text-xs text-gray-500 transition hover:text-gray-300"
          >
            Dismiss
          </button>
        </>
      )}
      {state.status === 'downloading' && (
        <>
          <span>Downloading update... {state.percent.toFixed(0)}%</span>
          <div className="w-32">
            <ProgressBar value={state.percent} size="sm" className="bg-white/10" />
          </div>
        </>
      )}
      {state.status === 'ready' && (
        <>
          <span>Update {state.version} ready to install!</span>
          <Button type="button" size="sm" onClick={() => electronAPI?.installUpdate()} className="rounded-md text-xs font-semibold">
            Restart & Update
          </Button>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="ml-auto text-xs text-gray-500 transition hover:text-gray-300"
          >
            Later
          </button>
        </>
      )}
      {isError && state.status === 'error' && (
        <>
          <span className="min-w-0 flex-1 truncate">Update failed: {state.message}</span>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              setState({ status: 'idle' })
              electronAPI?.checkForUpdates()
            }}
            className="rounded-md text-xs font-semibold"
          >
            Retry
          </Button>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="text-xs text-red-300/70 transition hover:text-red-100"
          >
            Dismiss
          </button>
        </>
      )}
      {isIncompatible && state.status === 'incompatible' && (
        <>
          <span className="min-w-0 flex-1 truncate">
            {state.reason === 'client-too-new'
              ? `This app is newer than the server supports (max ${state.maxClient ?? '?'}). Ask your server admin to upgrade.`
              : state.reason === 'client-too-old'
                ? `This app is older than the server requires (min ${state.minClient}). Please update manually from the Downloads page.`
                : 'This app is not compatible with the configured server.'}
          </span>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="text-xs text-red-300/70 transition hover:text-red-100"
          >
            Dismiss
          </button>
        </>
      )}
    </div>
  )
}

function PwaUpdateBanner() {
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const handler = () => {
      setUpdateAvailable(true)
      setDismissed(false)
    }
    window.addEventListener('sw-update-available', handler)
    return () => window.removeEventListener('sw-update-available', handler)
  }, [])

  if (!updateAvailable || dismissed) return null

  return (
    <div className="flex items-center gap-3 border-b border-white/5 bg-surface-raised px-4 py-2 text-sm text-gray-300">
      <span>A new version is available!</span>
      <Button
        type="button"
        size="sm"
        onClick={() => {
          const w = window as typeof window & { __updateSW?: (reload?: boolean) => void }
          w.__updateSW?.(true)
        }}
        className="rounded-md text-xs font-semibold"
      >
        Reload
      </Button>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="ml-auto text-xs text-gray-500 transition hover:text-gray-300"
      >
        Later
      </button>
    </div>
  )
}

export function UpdateBanner() {
  if (isElectron) return <ElectronUpdateBanner />
  return <PwaUpdateBanner />
}
