import { useEffect, useRef } from 'react'
import { useSettingsStore } from '@/stores/settings.store'
import { useAuthStore } from '@/stores/auth.store'
import { getNotifSettings, subscribeToPush } from '@/lib/notifications'
import { showToast } from '@/stores/toast.store'
import { i18n } from './config'
import { ensureLocaleLoaded } from './loadBundles'

/**
 * Keeps i18n language and document.lang in sync with persisted user locale.
 */
export function LocaleSync({ children }: { children: React.ReactNode }) {
  const locale = useSettingsStore((s) => s.locale)
  const accessToken = useAuthStore((s) => s.accessToken)
  const userId = useAuthStore((s) => s.user?.id)
  const userLocale = useAuthStore((s) => s.user?.locale)
  const isAuthLoading = useAuthStore((s) => s.isLoading)
  const previousLocale = useRef(locale)
  const syncedUserId = useRef<string | null>(null)

  useEffect(() => {
    const apply = () => {
      const loc = useSettingsStore.getState().locale
      void ensureLocaleLoaded(loc).then(() => {
        void i18n.changeLanguage(loc)
        document.documentElement.lang = loc
      })
    }

    if (useSettingsStore.persist.hasHydrated()) {
      apply()
      return
    }

    const unsub = useSettingsStore.persist.onFinishHydration(() => {
      apply()
    })
    return unsub
  }, [])

  useEffect(() => {
    if (!accessToken || !userId) {
      syncedUserId.current = null
      return
    }
    if (isAuthLoading) return

    const applyAccountLocale = () => {
      const user = useAuthStore.getState().user
      if (!user || user.id !== userId) return

      const settings = useSettingsStore.getState()
      if (syncedUserId.current !== userId) {
        syncedUserId.current = userId
        if (user.locale) {
          if (settings.locale !== user.locale) settings.setLocale(user.locale)
          return
        }

        void useAuthStore.getState().updateLocale(settings.locale).catch((error: unknown) => {
          console.error('Failed to save initial account locale', error)
          showToast(
            i18n.t('settings:appearance.language'),
            i18n.t('settings:appearance.languageSaveFailed')
          )
        })
        return
      }

      if (user.locale && settings.locale !== user.locale) {
        settings.setLocale(user.locale)
      }
    }

    if (useSettingsStore.persist.hasHydrated()) {
      applyAccountLocale()
      return
    }
    return useSettingsStore.persist.onFinishHydration(applyAccountLocale)
  }, [accessToken, isAuthLoading, userId, userLocale])

  useEffect(() => {
    if (!useSettingsStore.persist.hasHydrated()) return
    void ensureLocaleLoaded(locale).then(() => {
      void i18n.changeLanguage(locale)
      document.documentElement.lang = locale
    })
  }, [locale])

  useEffect(() => {
    if (previousLocale.current === locale) return
    previousLocale.current = locale
    if (accessToken && getNotifSettings().enabled) {
      void subscribeToPush(accessToken)
    }
  }, [locale, accessToken])

  return <>{children}</>
}
