import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App.tsx'

const updateSW = registerSW({
  onNeedRefresh() {
    window.dispatchEvent(new CustomEvent('sw-update-available'))
  },
  onRegisteredSW(_swUrl, registration) {
    if (registration) {
      setInterval(
        () => {
          registration.update()
        },
        60 * 60 * 1000
      )
    }
  }
})

;(window as any).__updateSW = updateSW

createRoot(document.getElementById('root')!).render(<App />)
