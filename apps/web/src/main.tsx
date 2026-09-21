import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { initI18n } from '@/i18n/config'
import { isDesktop } from '@/lib/desktop'
import App from './App.tsx'

let visibilityTriggered = false

// Mouse 4 / Mouse 5 behavior on desktop (browser-style back/forward, unless the
// button is bound to push-to-talk) is handled by `useSideButtonNavigation`, which
// needs the router. WebView2's default navigation is suppressed there too.

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

      // Cold-start check: the browser only re-fetches sw.js when we ask —
      // without this, a PWA that stayed closed across a deploy keeps serving
      // the old version until a visibility change or the hourly timer.
      // Deferred so React is mounted (an early `waiting` would setState before
      // render). 304 when nothing changed; full re-fetch otherwise.
      setTimeout(() => void registration.update().catch(() => {}), 2000)

      const state = () => {
        const sw = registration.active
        return sw ? { sw: sw.scriptURL, state: sw.state } : 'none'
      }
      // Exposed for Safari Web Inspector diagnostics if PWA updates misbehave:
      // inspect `window.__jabluSW` in an opened PWA (survives dropConsole,
      // which strips console.* in production builds).
      ;(window as typeof window & { __jabluSW?: unknown }).__jabluSW = state()

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
