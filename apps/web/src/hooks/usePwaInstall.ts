import { useCallback, useSyncExternalStore } from 'react'
import { isElectron } from '@/lib/electron'

export type BrowserName = 'chrome' | 'edge' | 'firefox' | 'safari' | 'samsung' | 'unknown'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferredPrompt: BeforeInstallPromptEvent | null = null
let listeners: Array<() => void> = []

function notify() {
  listeners.forEach((l) => l())
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferredPrompt = e as BeforeInstallPromptEvent
    notify()
  })

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    notify()
  })
}

function subscribePrompt(cb: () => void) {
  listeners.push(cb)
  return () => {
    listeners = listeners.filter((l) => l !== cb)
  }
}

function getCanPrompt() {
  return deferredPrompt !== null
}

export function detectBrowser(): BrowserName {
  if (typeof navigator === 'undefined') return 'unknown'
  const ua = navigator.userAgent
  if (/SamsungBrowser/i.test(ua)) return 'samsung'
  if (/Edg\//i.test(ua)) return 'edge'
  if (/CriOS|Chrome/i.test(ua) && !/Edg\//i.test(ua)) return 'chrome'
  if (/FxiOS|Firefox/i.test(ua)) return 'firefox'
  if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) return 'safari'
  return 'unknown'
}

export function getIsStandalone(): boolean {
  if (typeof window === 'undefined') return false
  if ((navigator as unknown as { standalone?: boolean }).standalone) return true
  return window.matchMedia('(display-mode: standalone)').matches
}

export function getIsMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
}

export function getIsIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iPhone|iPad|iPod/i.test(navigator.userAgent)
}

export function usePwaInstall() {
  const canPrompt = useSyncExternalStore(subscribePrompt, getCanPrompt, () => false)

  const triggerInstall = useCallback(async () => {
    if (!deferredPrompt) return false
    const result = await deferredPrompt.prompt()
    if (result.outcome === 'accepted') {
      deferredPrompt = null
      notify()
    }
    return result.outcome === 'accepted'
  }, [])

  const isInstalled = getIsStandalone()
  const browserName = detectBrowser()
  const isMobile = getIsMobileDevice()
  const isIOS = getIsIOS()

  const showInstallUi = !isElectron && !isInstalled

  return { canPrompt, isInstalled, browserName, isMobile, isIOS, triggerInstall, showInstallUi }
}

const DISMISS_KEY = 'pwa-install-dismissed'
const RESHOW_MS = 14 * 24 * 60 * 60 * 1000

export function isDismissed(): boolean {
  try {
    const ts = localStorage.getItem(DISMISS_KEY)
    if (!ts) return false
    return Date.now() - Number(ts) < RESHOW_MS
  } catch {
    return false
  }
}

export function dismissBanner() {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()))
  } catch {
    /* ignore */
  }
}
