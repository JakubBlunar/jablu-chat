import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui'
import { isElectron } from '@/lib/electron'
import { useDesktopUpdateStore } from '@/stores/desktopUpdate.store'

function ElectronUpdateBanner() {
  const { t } = useTranslation('common')
  const state = useDesktopUpdateStore((s) => s.state)
  const check = useDesktopUpdateStore((s) => s.check)

  // Ready / downloading live in the title bar (Discord-style green arrow).
  // The banner is reserved for failures that need an explanation.
  if (state.status !== 'error' && state.status !== 'incompatible') return null

  const isError = state.status === 'error'

  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-red-500/30 bg-red-950/40 px-4 py-2 text-sm text-red-200">
      {isError && (
        <>
          <span className="min-w-0 flex-1 truncate">{t('updateFailed', { message: state.message })}</span>
          <Button
            type="button"
            size="sm"
            onClick={() => void check()}
            className="rounded-md text-xs font-semibold"
          >
            {t('retry')}
          </Button>
        </>
      )}
      {state.status === 'incompatible' && (
        <span className="min-w-0 flex-1 truncate">
          {state.reason === 'client-too-new'
            ? t('clientTooNew', { version: state.maxClient ?? '?' })
            : state.reason === 'client-too-old'
              ? t('clientTooOld', { version: state.minClient })
              : t('serverIncompatible')}
        </span>
      )}
    </div>
  )
}

function PwaUpdateBanner() {
  const { t } = useTranslation('common')
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
    <div className="flex shrink-0 items-center gap-3 border-b border-white/5 bg-surface-raised px-4 py-2 text-sm text-gray-300">
      <span>{t('newVersionAvailable')}</span>
      <Button
        type="button"
        size="sm"
        onClick={() => {
          const w = window as typeof window & { __updateSW?: (reload?: boolean) => void }
          w.__updateSW?.(true)
        }}
        className="rounded-md text-xs font-semibold"
      >
        {t('reload')}
      </Button>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="ml-auto text-xs text-gray-500 transition hover:text-gray-300"
      >
        {t('later')}
      </button>
    </div>
  )
}

export function UpdateBanner() {
  if (isElectron) return <ElectronUpdateBanner />
  return <PwaUpdateBanner />
}
