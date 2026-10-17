import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { isElectron } from '@/lib/electron'
import { getDevicePlatform } from '@/lib/platform'
import { api } from '@/lib/api'
import { PwaInstallGuide } from '@/components/PwaInstallGuide'

interface DownloadEntry {
  filename: string
  platform: string
  version: string | null
  size: number
  updatedAt: string
}

const PLATFORM_LABELS: Record<string, string> = { windows: 'Windows', macos: 'macOS', linux: 'Linux' }

export function DownloadAppSection() {
  const { t } = useTranslation('settings')
  const [downloads, setDownloads] = useState<DownloadEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const platform = getDevicePlatform()

  useEffect(() => {
    if (isElectron || platform === 'macos') return
    let cancelled = false
    setLoading(true)
    setFailed(false)
    void api
      .get<DownloadEntry[]>('/api/downloads')
      .then((data) => {
        if (!cancelled) setDownloads(data)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [platform, attempt])

  if (isElectron)
    return (
      <p role="status" className="text-sm text-green-400">
        {t('install.installed')}
      </p>
    )
  if (platform === 'macos') return <PwaInstallGuide />
  if (loading)
    return (
      <p role="status" className="text-sm text-gray-400">
        {t('install.loading')}
      </p>
    )
  if (failed)
    return (
      <div role="alert" className="space-y-3 text-sm text-gray-300">
        <p>{t('install.downloadError')}</p>
        <button type="button" onClick={() => setAttempt((value) => value + 1)} className="min-h-11 text-primary">
          {t('install.retry')}
        </button>
      </div>
    )

  const recommended = downloads.filter((download) => download.platform === platform)
  const others = downloads.filter((download) => download.platform !== platform)
  const cards = (entries: DownloadEntry[]) =>
    entries.map((download) => (
      <a
        key={download.filename}
        href={`${api.baseUrl}/api/downloads/${encodeURIComponent(download.filename)}`}
        download
        target="_blank"
        rel="noopener noreferrer"
        className="flex min-h-14 items-center justify-between gap-3 rounded-lg bg-surface-darkest p-3 hover:bg-surface-raised"
      >
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-white">
            {PLATFORM_LABELS[download.platform] ?? download.platform}
            {download.version ? ` v${download.version}` : ''}
          </span>
          <span className="block truncate text-xs text-gray-400">
            {(download.size / 1024 / 1024).toFixed(1)} MB · {download.filename}
          </span>
        </span>
        <span aria-hidden="true" className="text-primary">
          ↓
        </span>
      </a>
    ))

  return (
    <div className="space-y-4">
      <h3 className="text-base font-semibold text-white">{t('install.desktopTitle')}</h3>
      <p className="text-sm text-gray-400">{t('install.desktopHint')}</p>
      {recommended.length ? (
        cards(recommended)
      ) : (
        <div className="space-y-3 text-sm text-gray-300">
          <p>{t('install.noDownload')}</p>
          <button
            type="button"
            className="min-h-11 text-primary"
            onClick={() => window.dispatchEvent(new CustomEvent('open-settings', { detail: 'install' }))}
          >
            {t('install.pwaAlternative')}
          </button>
        </div>
      )}
      {others.length > 0 && (
        <details className="space-y-3">
          <summary className="min-h-11 cursor-pointer py-3 text-sm text-gray-400">
            {t('install.otherPlatforms')}
          </summary>
          <div className="space-y-2">{cards(others)}</div>
        </details>
      )}
      <p className="text-xs text-gray-400">{t('install.nativeDetectionHint')}</p>
    </div>
  )
}
