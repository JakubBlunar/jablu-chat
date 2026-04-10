import i18n from 'i18next'
import { isAppLocale, type AppLocale } from './locales'

/** All JSON namespaces under locales/{lng}/ — keep in sync with files on disk. */
export const I18N_NAMESPACES = [
  'common',
  'settings',
  'chat',
  'a11y',
  'nav',
  'voice',
  'auth',
  'search'
] as const

export type I18nNamespace = (typeof I18N_NAMESPACES)[number]

const loaders = import.meta.glob<{ default: Record<string, unknown> }>('./locales/*/*.json')

export async function loadLanguageBundles(lng: string): Promise<void> {
  await Promise.all(
    I18N_NAMESPACES.map(async (ns) => {
      const path = `./locales/${lng}/${ns}.json`
      const loader = loaders[path]
      if (!loader) {
        throw new Error(`Missing locale bundle: ${path}`)
      }
      const mod = await loader()
      i18n.addResourceBundle(lng, ns, mod.default, true, true)
    })
  )
}

const loadedLocales = new Set<string>()

export async function ensureLocaleLoaded(lng: string): Promise<void> {
  if (loadedLocales.has(lng)) return
  await loadLanguageBundles(lng)
  loadedLocales.add(lng)
}

const STORAGE_KEY = 'jablu-settings'

export function readPersistedLocale(): AppLocale {
  if (typeof window === 'undefined') return 'en'
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return 'en'
    const parsed = JSON.parse(raw) as { state?: { locale?: string } }
    const loc = parsed.state?.locale
    if (loc && isAppLocale(loc)) return loc
    return 'en'
  } catch {
    return 'en'
  }
}
