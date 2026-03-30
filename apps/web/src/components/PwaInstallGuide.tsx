import { usePwaInstall, type BrowserName } from '@/hooks/usePwaInstall'

export function PwaInstallGuide() {
  const { canPrompt, browserName, isMobile, isIOS, triggerInstall } = usePwaInstall()

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-400 leading-relaxed">
        Install Jablu as an app on your device for quick access, push notifications, and a full-screen experience — no
        app store needed.
      </p>

      {canPrompt && (
        <div className="rounded-lg bg-surface-darkest p-4">
          <p className="mb-3 text-sm text-gray-300">Your browser supports one-click install:</p>
          <button
            type="button"
            onClick={() => void triggerInstall()}
            className="rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-text transition hover:bg-primary-hover"
          >
            Install Jablu
          </button>
        </div>
      )}

      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-white">
          {canPrompt ? 'Or follow the manual steps' : 'How to install'}
        </h3>
        <BrowserGuide browser={browserName} isMobile={isMobile} isIOS={isIOS} />
      </div>

      <AllBrowserGuides currentBrowser={browserName} isMobile={isMobile} />
    </div>
  )
}

function BrowserGuide({ browser, isMobile, isIOS }: { browser: BrowserName; isMobile: boolean; isIOS: boolean }) {
  if (isIOS || (browser === 'safari' && isMobile)) {
    return <SafariIOSGuide />
  }

  if (browser === 'safari') return <SafariMacGuide />
  if (browser === 'firefox' && isMobile) return <FirefoxAndroidGuide />
  if (browser === 'firefox') return <FirefoxDesktopGuide />
  if (browser === 'samsung') return <SamsungGuide />
  if (browser === 'chrome' && isMobile) return <ChromeAndroidGuide />
  if (browser === 'edge') return <EdgeGuide isMobile={isMobile} />
  if (browser === 'chrome') return <ChromeDesktopGuide />

  return <GenericGuide />
}

function AllBrowserGuides({ currentBrowser, isMobile }: { currentBrowser: BrowserName; isMobile: boolean }) {
  const others = getOtherGuides(currentBrowser, isMobile)

  if (others.length === 0) return null

  return (
    <div className="space-y-3 border-t border-white/10 pt-5">
      <h3 className="text-sm font-semibold text-white">Other browsers</h3>
      <div className="space-y-4">
        {others.map((guide) => (
          <details key={guide.label} className="group rounded-lg bg-surface-darkest">
            <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-gray-300 transition hover:text-white">
              <span className="ml-1">{guide.label}</span>
            </summary>
            <div className="px-4 pb-4">{guide.content}</div>
          </details>
        ))}
      </div>
    </div>
  )
}

function getOtherGuides(current: BrowserName, isMobile: boolean) {
  const guides: Array<{ label: string; content: React.ReactNode }> = []

  if (isMobile) {
    if (current !== 'safari') guides.push({ label: 'Safari (iOS)', content: <SafariIOSGuide /> })
    if (current !== 'chrome') guides.push({ label: 'Chrome (Android)', content: <ChromeAndroidGuide /> })
    if (current !== 'firefox') guides.push({ label: 'Firefox (Android)', content: <FirefoxAndroidGuide /> })
    if (current !== 'samsung') guides.push({ label: 'Samsung Internet', content: <SamsungGuide /> })
  } else {
    if (current !== 'chrome') guides.push({ label: 'Google Chrome', content: <ChromeDesktopGuide /> })
    if (current !== 'edge') guides.push({ label: 'Microsoft Edge', content: <EdgeGuide isMobile={false} /> })
    if (current !== 'safari') guides.push({ label: 'Safari (macOS)', content: <SafariMacGuide /> })
    if (current !== 'firefox') guides.push({ label: 'Firefox', content: <FirefoxDesktopGuide /> })
  }

  return guides
}

function StepList({ steps }: { steps: string[] }) {
  return (
    <ol className="space-y-2">
      {steps.map((step, i) => (
        <li key={i} className="flex gap-3 text-sm text-gray-300 leading-relaxed">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-semibold text-primary">
            {i + 1}
          </span>
          <span dangerouslySetInnerHTML={{ __html: step }} />
        </li>
      ))}
    </ol>
  )
}

function ChromeDesktopGuide() {
  return (
    <StepList
      steps={[
        'Click the <strong>install icon</strong> (monitor with down arrow) in the right side of the address bar',
        'Click <strong>"Install"</strong> in the popup dialog',
        'Jablu will open as a standalone app window'
      ]}
    />
  )
}

function ChromeAndroidGuide() {
  return (
    <StepList
      steps={[
        'Tap the <strong>three-dot menu</strong> (<strong>\u22EE</strong>) in the top-right corner',
        'Tap <strong>"Add to Home screen"</strong> or <strong>"Install app"</strong>',
        'Tap <strong>"Install"</strong> to confirm',
        'Jablu will appear on your home screen'
      ]}
    />
  )
}

function SafariIOSGuide() {
  return (
    <StepList
      steps={[
        'Tap the <strong>Share button</strong> (<strong>\uD83D\uDD3A</strong> square with up arrow) at the bottom of the screen',
        'Scroll down and tap <strong>"Add to Home Screen"</strong>',
        'Tap <strong>"Add"</strong> in the top-right corner',
        'Jablu will appear on your home screen as a full-screen app'
      ]}
    />
  )
}

function SafariMacGuide() {
  return (
    <StepList
      steps={[
        'In the menu bar, click <strong>File</strong> \u2192 <strong>"Add to Dock"</strong>',
        'Click <strong>"Add"</strong> to confirm',
        'Jablu will appear in your Dock and open as a standalone app'
      ]}
    />
  )
}

function FirefoxAndroidGuide() {
  return (
    <StepList
      steps={[
        'Tap the <strong>three-dot menu</strong> (<strong>\u22EE</strong>) in the top-right corner',
        'Tap <strong>"Install"</strong>',
        'Tap <strong>"Add"</strong> to confirm',
        'Jablu will appear on your home screen'
      ]}
    />
  )
}

function FirefoxDesktopGuide() {
  return (
    <div className="text-sm text-gray-400 leading-relaxed">
      <p>
        Firefox desktop does not currently support installing PWAs directly. For the best app experience on desktop, try
        opening Jablu in <strong className="text-gray-300">Chrome</strong> or{' '}
        <strong className="text-gray-300">Edge</strong> and installing from there.
      </p>
    </div>
  )
}

function EdgeGuide({ isMobile }: { isMobile: boolean }) {
  if (isMobile) {
    return (
      <StepList
        steps={[
          'Tap the <strong>menu button</strong> (<strong>\u2026</strong>) at the bottom of the screen',
          'Tap <strong>"Add to phone"</strong>',
          'Tap <strong>"Add"</strong> to confirm'
        ]}
      />
    )
  }

  return (
    <StepList
      steps={[
        'Click the <strong>three-dot menu</strong> (<strong>\u22EF</strong>) in the top-right corner',
        'Hover over <strong>"Apps"</strong>',
        'Click <strong>"Install this site as an app"</strong>',
        'Click <strong>"Install"</strong> to confirm'
      ]}
    />
  )
}

function SamsungGuide() {
  return (
    <StepList
      steps={[
        'Tap the <strong>menu button</strong> (<strong>\u2261</strong>) at the bottom-right',
        'Tap <strong>"Add page to"</strong> \u2192 <strong>"Home screen"</strong>',
        'Tap <strong>"Add"</strong> to confirm'
      ]}
    />
  )
}

function GenericGuide() {
  return (
    <div className="text-sm text-gray-400 leading-relaxed">
      <p>
        Look for an <strong className="text-gray-300">"Install"</strong>,{' '}
        <strong className="text-gray-300">"Add to Home Screen"</strong>, or{' '}
        <strong className="text-gray-300">"Install app"</strong> option in your browser&rsquo;s menu. If your browser
        doesn&rsquo;t support installation, try opening Jablu in Chrome, Edge, or Safari.
      </p>
    </div>
  )
}
