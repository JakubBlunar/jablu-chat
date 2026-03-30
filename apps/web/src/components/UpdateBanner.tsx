import { useEffect, useState } from 'react'
import { Button, ProgressBar } from '@/components/ui'
import { electronAPI, isElectron } from '@/lib/electron'

type UpdateState =
  | { status: 'idle' }
  | { status: 'available'; version: string }
  | { status: 'downloading'; percent: number }
  | { status: 'ready'; version: string }
  | { status: 'error'; message: string }

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
      })
    ]

    return () => unsubs.forEach((fn) => fn())
  }, [])

  if (dismissed || state.status === 'idle' || state.status === 'error') return null

  return (
    <div className="flex items-center gap-3 border-b border-white/5 bg-surface-raised px-4 py-2 text-sm text-gray-300">
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
          ;(window as any).__updateSW?.(true)
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
