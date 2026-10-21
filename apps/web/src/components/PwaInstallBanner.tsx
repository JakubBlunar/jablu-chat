import { useEffect, useState } from 'react'
import { isElectron } from '@/lib/electron'
import { usePwaInstall, isDismissed, dismissBanner } from '@/hooks/usePwaInstall'
import { useTranslation } from 'react-i18next'
import { useIsMobile } from '@/hooks/useMobile'
import { useVoiceConnectionStore } from '@/stores/voice-connection.store'

export function PwaInstallBanner() {
  const { t } = useTranslation('settings')
  const { canPrompt, showInstallUi, triggerInstall, installTarget } = usePwaInstall()
  const [visible, setVisible] = useState(false)
  const mobile = useIsMobile()
  const inCall = useVoiceConnectionStore((s) => !!s.currentChannelId)

  useEffect(() => {
    if (!showInstallUi || isDismissed()) return
    const id = setTimeout(() => setVisible(true), 5000)
    return () => clearTimeout(id)
  }, [showInstallUi])

  if (isElectron || !showInstallUi || !visible || inCall || (mobile && installTarget === 'desktop')) return null

  const handleDismiss = () => {
    setVisible(false)
    dismissBanner()
  }

  const handleInstall = async () => {
    const accepted = await triggerInstall()
    if (accepted) setVisible(false)
  }

  const openGuide = () => {
    handleDismiss()
    window.dispatchEvent(
      new CustomEvent('open-settings', { detail: installTarget === 'desktop' ? 'downloads' : 'install' })
    )
  }

  return (
    <div className="flex items-center gap-3 border-b border-white/5 bg-surface-raised px-4 py-2 text-sm">
      <svg
        className="h-4 w-4 shrink-0 text-primary"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
      </svg>
      <span className="min-w-0 flex-1 text-gray-300">
        {t(installTarget === 'desktop' ? 'install.desktopBanner' : 'install.pwaBanner')}
      </span>
      {installTarget === 'pwa' && canPrompt ? (
        <button
          type="button"
          onClick={() => void handleInstall()}
          className="min-h-11 shrink-0 rounded-md bg-primary px-3 py-1 text-xs font-semibold text-primary-text transition hover:bg-primary-hover"
        >
          {t('install.install')}
        </button>
      ) : (
        <button
          type="button"
          onClick={openGuide}
          className="min-h-11 shrink-0 rounded-md bg-primary px-3 py-1 text-xs font-semibold text-primary-text transition hover:bg-primary-hover"
        >
          {t(installTarget === 'desktop' ? 'install.getWindowsApp' : 'install.how')}
        </button>
      )}
      <button
        type="button"
        onClick={handleDismiss}
        className="flex h-11 w-11 shrink-0 items-center justify-center text-gray-500 transition hover:text-gray-300"
        aria-label={t('install.dismiss')}
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z" />
        </svg>
      </button>
    </div>
  )
}
