import { useSyncExternalStore } from 'react'
import { useSettingsStore } from '@/stores/settings.store'
import { getSystemTheme, subscribeSystemTheme } from '@/lib/systemTheme'

export type ThemePreference = 'light' | 'dark' | 'system'

export function useTheme(): 'light' | 'dark' {
  const preference = useSettingsStore((s) => s.theme)
  const system = useSyncExternalStore(subscribeSystemTheme, getSystemTheme, () => 'dark' as const)
  return preference === 'system' ? system : preference
}
