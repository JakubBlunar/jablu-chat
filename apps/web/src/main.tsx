import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { initI18n } from '@/i18n/config'
import App from './App.tsx'

let visibilityTriggered = false

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
      setTimeout(() => { visibilityTriggered = false }, 10_000)
    })
  }
})

;(window as typeof window & { __updateSW: typeof updateSW }).__updateSW = updateSW

void initI18n().then(() => {
  createRoot(document.getElementById('root')!).render(<App />)
})
