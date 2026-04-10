import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { ensureLocaleLoaded, I18N_NAMESPACES, readPersistedLocale } from './loadBundles'

/**
 * Loads locale JSON via dynamic import (Vite code-splits per language × namespace).
 * Call once before rendering the app (see main.tsx).
 */
export async function initI18n(): Promise<void> {
  const initial = readPersistedLocale()

  await i18n.use(initReactI18next).init({
    lng: initial,
    fallbackLng: 'en',
    defaultNS: 'common',
    ns: [...I18N_NAMESPACES],
    resources: {},
    partialBundledLanguages: true,
    interpolation: { escapeValue: false },
    react: { useSuspense: false }
  })

  await ensureLocaleLoaded('en')
  if (initial !== 'en') {
    await ensureLocaleLoaded(initial)
  }
  await i18n.changeLanguage(initial)
}

export { i18n }
