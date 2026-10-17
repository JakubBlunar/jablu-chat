import { useCallback, useEffect, useSyncExternalStore } from 'react'
import i18n from 'i18next'
import { isElectron } from '@/lib/electron'
import { getDevicePlatform } from '@/lib/platform'
import { useSettingsStore } from '@/stores/settings.store'
import { showToast } from '@/stores/toast.store'

export type BrowserName = 'chrome' | 'edge' | 'firefox' | 'safari' | 'samsung' | 'unknown'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferredPrompt: BeforeInstallPromptEvent | null = null
let installedInSession = false
let relatedAppsCheck: Promise<boolean> | undefined
let listeners: Array<() => void> = []

function notify() {
  listeners.forEach((l) => l())
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferredPrompt = e as BeforeInstallPromptEvent
    installedInSession = false
    notify()
  })

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    installedInSession = true
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
  const device: Navigator & { standalone?: boolean } = navigator
  if (device.standalone) return true
  return window.matchMedia(
    '(display-mode: standalone), (display-mode: minimal-ui), (display-mode: window-controls-overlay)'
  ).matches
}

export function getIsMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false
  return ['android', 'ios'].includes(getDevicePlatform())
}

export function getIsIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  return getDevicePlatform() === 'ios'
}

export async function checkRelatedInstalledApp(): Promise<boolean> {
  const device: Navigator & {
    getInstalledRelatedApps?: () => Promise<{ platform: string; url?: string }[]>
  } = navigator
  if (!device.getInstalledRelatedApps) return false
  const apps = await device.getInstalledRelatedApps()
  const manifest = new URL('/manifest.webmanifest', location.origin).href
  return apps.some((app) => app.platform === 'webapp' && app.url && new URL(app.url, location.origin).href === manifest)
}

function getInstalled() {
  return installedInSession || getIsStandalone()
}

export function usePwaInstall() {
  const canPrompt = useSyncExternalStore(subscribePrompt, getCanPrompt, () => false)
  const isInstalled = useSyncExternalStore(subscribePrompt, getInstalled, () => false)
  useEffect(() => {
    if (isElectron) return
    const mode = window.matchMedia(
      '(display-mode: standalone), (display-mode: minimal-ui), (display-mode: window-controls-overlay)'
    )
    mode.addEventListener('change', notify)
    relatedAppsCheck ??= checkRelatedInstalledApp()
    void relatedAppsCheck
      .then((installed) => {
        if (installed) {
          installedInSession = true
          notify()
        }
      })
      .catch((error: unknown) => console.warn('Unable to check installed related applications', error))
    return () => mode.removeEventListener('change', notify)
  }, [])

  const triggerInstall = useCallback(async () => {
    if (!deferredPrompt) return false
    const prompt = deferredPrompt
    deferredPrompt = null
    notify()
    try {
      const result = await prompt.prompt()
      return result.outcome === 'accepted'
    } catch {
      showToast(i18n.t('common:error'), i18n.t('settings:install.failed'))
      return false
    }
  }, [])

  const browserName = detectBrowser()
  const isMobile = getIsMobileDevice()
  const isIOS = getIsIOS()

  const showInstallUi = !isElectron && !isInstalled
  const installTarget = getDevicePlatform() === 'windows' ? 'desktop' : 'pwa'

  return { canPrompt, isInstalled, browserName, isMobile, isIOS, triggerInstall, showInstallUi, installTarget }
}

const RESHOW_MS = 14 * 24 * 60 * 60 * 1000

export function isDismissed(): boolean {
  const ts = useSettingsStore.getState().pwaInstallDismissedAt
  if (ts == null) return false
  return Date.now() - ts < RESHOW_MS
}

export function dismissBanner() {
  try {
    useSettingsStore.getState().setPwaInstallDismissedAt(Date.now())
  } catch {
    showToast(i18n.t('common:error'), i18n.t('settings:install.preferencesError'))
  }
}
