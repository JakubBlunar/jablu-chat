import { useLayoutEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useTheme } from '@/hooks/useTheme'
import { useAuthStore } from '@/stores/auth.store'
import { useSettingsStore } from '@/stores/settings.store'
import { applyAccentPreset } from '@/lib/accent'

/** Root scope includes portalled dialogs, but excludes public and superadmin routes. */
export function ThemeSync() {
  const theme = useTheme()
  const authenticated = useAuthStore((s) => s.isAuthenticated)
  const { pathname } = useLocation()
  const resolved = authenticated && (pathname === '/' || pathname.startsWith('/channels/')) ? theme : 'dark'
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = resolved
    applyAccentPreset(useSettingsStore.getState().accent)
    const meta = document.querySelector('meta[name="theme-color"]')
    const previous = meta?.getAttribute('content')
    meta?.setAttribute('content', resolved === 'light' ? '#f7f9fc' : '#1a1c28')
    return () => {
      delete document.documentElement.dataset.theme
      applyAccentPreset(useSettingsStore.getState().accent)
      if (previous) meta?.setAttribute('content', previous)
    }
  }, [resolved])
  return null
}
