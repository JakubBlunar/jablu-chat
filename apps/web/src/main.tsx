import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { initI18n } from '@/i18n/config'
import { isDesktop } from '@/lib/desktop'
import App from './App.tsx'

let visibilityTriggered = false

// In the desktop shell the X mouse buttons (Mouse 4 / Mouse 5) are commonly bound
// to push-to-talk. WebView2 would otherwise treat them as browser back/forward and
// navigate the SPA on every press, so we suppress that default here. Global PTT
// detection happens natively (rdev) and is unaffected by this.
if (isDesktop) {
  const suppressSideButtonNav = (e: MouseEvent) => {
    if (e.button === 3 || e.button === 4) e.preventDefault()
  }
  window.addEventListener('mousedown', suppressSideButtonNav, { capture: true })
  window.addEventListener('mouseup', suppressSideButtonNav, { capture: true })
  window.addEventListener('auxclick', suppressSideButtonNav, { capture: true })
}

// The Tauri desktop shell serves assets from tauri.localhost and updates via the
// native updater, so the PWA service worker is skipped there.
if (!isDesktop) {
  const updateSW = registerSW({
    onNeedRefresh() {
      if (visibilityTriggered) {
        visibilityTriggered = false
        updateSW(true)
      } else {
        window.dispatchEvent(new CustomEvent('sw-update-available'))
      }
    },
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return

      setInterval(() => registration.update(), 60 * 60 * 1000)

      let lastCheck = Date.now()
      const CHECK_THROTTLE = 30_000

      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible') return
        const now = Date.now()
        if (now - lastCheck < CHECK_THROTTLE) return
        lastCheck = now
        visibilityTriggered = true
        registration.update()
        setTimeout(() => {
          visibilityTriggered = false
        }, 10_000)
      })
    }
  })

  ;(window as typeof window & { __updateSW: typeof updateSW }).__updateSW = updateSW
}

void initI18n().then(() => {
  createRoot(document.getElementById('root')!).render(<App />)
})
