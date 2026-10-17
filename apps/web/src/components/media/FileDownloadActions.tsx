import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMediaDownload } from '@/hooks/useMediaDownload'

export function FileDownloadActions({ url, filename }: { url: string; filename: string }) {
  const { t } = useTranslation('common')
  const [requested, setRequested] = useState(false)
  const autoSave = useRef(false)
  const needsGesture = navigator.maxTouchPoints > 0 && typeof navigator.canShare === 'function'
  const { preparing, saving, failed, download } = useMediaDownload(requested ? url : undefined, filename)

  useEffect(() => {
    if (requested && !preparing && !saving && !failed && autoSave.current) {
      autoSave.current = false
      void download()
    }
  }, [requested, preparing, saving, failed, download])

  const label = t(
    preparing
      ? 'preparingDownload'
      : saving
        ? 'saving'
        : failed
          ? 'retryDownload'
          : requested && needsGesture
            ? 'saveFile'
            : 'download'
  )
  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-11 items-center text-primary underline"
        >
          {t('openOriginal')}
        </a>
        <button
          type="button"
          disabled={preparing || saving}
          aria-label={`${label}: ${filename}`}
          className="min-h-11 text-primary underline disabled:opacity-60"
          onClick={() => {
            if (!requested || failed) {
              // Sharing a prepared file needs a fresh tap on touch browsers.
              autoSave.current = !needsGesture
              if (!requested) setRequested(true)
              else void download()
            } else {
              void download()
            }
          }}
        >
          {label}
        </button>
      </div>
      {requested && needsGesture && !preparing && !saving && !failed && (
        <p role="status" className="text-xs text-gray-400">
          {t('fileReadyToSave')}
        </p>
      )}
    </div>
  )
}
