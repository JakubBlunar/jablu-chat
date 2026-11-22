import { useSyncExternalStore } from 'react'
import { useSettingsStore } from '@/stores/settings.store'
import { getSystemTheme, subscribeSystemTheme } from '@/lib/systemTheme'

export type ThemePreference = 'light' | 'dark' | 'system'

const skipSubscription = () => () => {}

export function useTheme(): 'light' | 'dark' {
  const preference = useSettingsStore((s) => s.theme)
  const system = useSyncExternalStore(
    preference === 'system' ? subscribeSystemTheme : skipSubscription,
    getSystemTheme,
    () => 'dark' as const
  )
  return preference === 'system' ? system : preference
}
