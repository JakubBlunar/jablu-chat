import { useEffect, useState } from 'react'
import { isElectron } from '@/lib/electron'
import { api } from '@/lib/api'

interface DownloadEntry {
  filename: string
  platform: string
  size: number
  updatedAt: string
}

const PLATFORM_ICONS: Record<string, string> = {
  windows: '🪟',
  macos: '🍎',
  linux: '🐧'
}

const PLATFORM_LABELS: Record<string, string> = {
  windows: 'Windows',
  macos: 'macOS',
  linux: 'Linux'
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function DownloadAppSection() {
  const [downloads, setDownloads] = useState<DownloadEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`${api.baseUrl}/api/downloads`)
      .then((r) => r.json())
      .then((data) => setDownloads(data as DownloadEntry[]))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (isElectron) return null
  if (loading) return null
  if (downloads.length === 0) return null

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-white">Desktop App</h3>
      <p className="text-xs text-gray-400">
        Get the desktop app for voice calls, screen sharing, and system tray notifications.
      </p>
      <div className="space-y-2">
        {downloads.map((d) => (
          <a
            key={d.filename}
            href={`${api.baseUrl}/api/downloads/${encodeURIComponent(d.filename)}`}
            download
            className="flex items-center gap-3 rounded-lg bg-surface-darkest p-3 transition hover:bg-surface-raised"
          >
            <span className="text-xl">{PLATFORM_ICONS[d.platform] ?? '💻'}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">{PLATFORM_LABELS[d.platform] ?? d.platform}</p>
              <p className="text-xs text-gray-500">
                {formatSize(d.size)} &middot; {d.filename}
              </p>
            </div>
            <svg
              className="h-4 w-4 shrink-0 text-gray-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
            </svg>
          </a>
        ))}
      </div>
    </div>
  )
}

export function DownloadAppBanner() {
  const [hasDownloads, setHasDownloads] = useState(false)
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem('download-banner-dismissed') === 'true')

  useEffect(() => {
    if (isElectron || dismissed) return
    fetch(`${api.baseUrl}/api/downloads`)
      .then((r) => r.json())
      .then((data: DownloadEntry[]) => setHasDownloads(data.length > 0))
      .catch(() => {})
  }, [dismissed])

  if (isElectron || dismissed || !hasDownloads) return null

  return (
    <div className="flex items-center gap-2 border-t border-white/5 px-3 py-2.5">
      <svg
        className="h-4 w-4 shrink-0 text-primary"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
      </svg>
      <span className="min-w-0 flex-1 text-xs text-gray-400 leading-snug">
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault()
            window.dispatchEvent(new CustomEvent('open-settings', { detail: 'downloads' }))
          }}
          className="text-primary hover:underline"
        >
          Get the desktop app
        </a>{' '}
        for better voice & video
      </span>
      <button
        type="button"
        onClick={() => {
          setDismissed(true)
          sessionStorage.setItem('download-banner-dismissed', 'true')
        }}
        className="text-gray-500 hover:text-gray-300"
        title="Dismiss"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z" />
        </svg>
      </button>
    </div>
  )
}
