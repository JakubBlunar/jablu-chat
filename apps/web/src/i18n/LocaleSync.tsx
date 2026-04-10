import { useEffect } from 'react'
import { useSettingsStore } from '@/stores/settings.store'
import { i18n } from './config'
import { ensureLocaleLoaded } from './loadBundles'

/**
 * Keeps i18n language and document.lang in sync with persisted user locale.
 */
export function LocaleSync({ children }: { children: React.ReactNode }) {
  const locale = useSettingsStore((s) => s.locale)

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
    if (!useSettingsStore.persist.hasHydrated()) return
    void ensureLocaleLoaded(locale).then(() => {
      void i18n.changeLanguage(locale)
      document.documentElement.lang = locale
    })
  }, [locale])

  return <>{children}</>
}
