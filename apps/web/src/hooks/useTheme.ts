import { useSyncExternalStore } from 'react'
import { useSettingsStore } from '@/stores/settings.store'

export type ThemePreference = 'light' | 'dark' | 'system'
const QUERY = '(prefers-color-scheme: light)'
function subscribe(listener: () => void) {
  const media = window.matchMedia?.(QUERY)
  media?.addEventListener('change', listener)
  return () => media?.removeEventListener('change', listener)
}
function systemIsLight() {
  return window.matchMedia?.(QUERY).matches ?? false
}

export function useTheme(): 'light' | 'dark' {
  const preference = useSettingsStore((s) => s.theme)
  const light = useSyncExternalStore(subscribe, systemIsLight, () => false)
  return preference === 'system' ? (light ? 'light' : 'dark') : preference
}
