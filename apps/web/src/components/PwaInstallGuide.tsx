import { useTranslation } from 'react-i18next'
import { usePwaInstall } from '@/hooks/usePwaInstall'

const GUIDES = {
  ios: { label: 'iOS / iPadOS', steps: ['ios1', 'ios2', 'ios3'] },
  safari: { label: 'Safari (macOS)', steps: ['safari1', 'safari2', 'safari3'] },
  chrome: { label: 'Chrome', steps: ['chrome1', 'chrome2', 'chrome3'] },
  chromeAndroid: { label: 'Chrome (Android)', steps: ['android1', 'android2', 'android3'] },
  edge: { label: 'Microsoft Edge', steps: ['edge1', 'edge2', 'chrome3'] },
  edgeMobile: { label: 'Microsoft Edge (mobile)', steps: ['edgeMobile1', 'edgeMobile2', 'android3'] },
  firefox: { label: 'Firefox', steps: ['firefoxDesktop'] },
  firefoxAndroid: { label: 'Firefox (Android)', steps: ['firefoxAndroid1', 'android3'] },
  samsung: { label: 'Samsung Internet', steps: ['samsung1', 'android3'] },
  unknown: { label: '', steps: ['generic'] }
} as const

type Guide = keyof typeof GUIDES

export function PwaInstallGuide() {
  const { t } = useTranslation('settings')
  const { canPrompt, browserName, isMobile, isIOS, triggerInstall, showInstallUi } = usePwaInstall()
  const guide: Guide = isIOS
    ? 'ios'
    : isMobile && browserName === 'chrome'
      ? 'chromeAndroid'
      : isMobile && browserName === 'edge'
        ? 'edgeMobile'
        : isMobile && browserName === 'firefox'
          ? 'firefoxAndroid'
          : browserName

  if (!showInstallUi)
    return (
      <p role="status" className="text-sm text-green-400">
        {t('install.installed')}
      </p>
    )

  return (
    <div className="space-y-6">
      <p className="text-sm leading-relaxed text-gray-400">{t('install.intro')}</p>
      {canPrompt && (
        <button
          type="button"
          onClick={() => void triggerInstall()}
          className="min-h-11 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-text hover:bg-primary-hover"
        >
          {t('install.install')}
        </button>
      )}
      <section>
        <h3 className="mb-3 text-sm font-semibold text-white">
          {t('install.how')} {GUIDES[guide].label}
        </h3>
        <Steps guide={guide} />
      </section>
      <p className="text-xs text-gray-400">{t('install.detectionHint')}</p>
      <div className="space-y-3 border-t border-white/10 pt-5">
        <h3 className="text-sm font-semibold text-white">{t('install.otherBrowsers')}</h3>
        {(Object.keys(GUIDES) as Guide[])
          .filter((key) => key !== guide && key !== 'unknown')
          .map((key) => (
            <details key={key} className="rounded-lg bg-surface-darkest">
              <summary className="min-h-11 cursor-pointer px-4 py-3 text-sm font-medium text-gray-300">
                {GUIDES[key].label}
              </summary>
              <div className="px-4 pb-4">
                <Steps guide={key} />
              </div>
            </details>
          ))}
      </div>
    </div>
  )
}

function Steps({ guide }: { guide: Guide }) {
  const { t } = useTranslation('settings')
  return (
    <ol className="space-y-3">
      {GUIDES[guide].steps.map((step, index) => (
        <li key={step} className="flex gap-3 text-sm leading-relaxed text-gray-300">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-semibold text-primary">
            {index + 1}
          </span>
          <span>{t(`install.steps.${step}`)}</span>
        </li>
      ))}
    </ol>
  )
}
