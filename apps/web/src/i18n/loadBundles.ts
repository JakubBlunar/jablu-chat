import i18n from 'i18next'
import { detectAppLocale, isAppLocale, type AppLocale } from './locales'

/** All JSON namespaces under locales/{lng}/ — keep in sync with files on disk. */
export const I18N_NAMESPACES = [
  'common',
  'settings',
  'chat',
  'a11y',
  'nav',
  'voice',
  'auth',
  'search',
  'server',
  'server-settings',
  'profile',
  'events',
  'channels',
  'friends',
  'forum'
] as const

export type I18nNamespace = (typeof I18N_NAMESPACES)[number]
export const BOOT_NAMESPACES: readonly I18nNamespace[] = ['common', 'a11y', 'auth', 'nav', 'settings']
const activeNamespaces = new Set<I18nNamespace>(BOOT_NAMESPACES)
const requests = new Map<string, Promise<void>>()

const loaders = import.meta.glob<{ default: Record<string, unknown> }>('./locales/*/*.json')

export async function loadLanguageBundles(lng: string, namespaces: readonly I18nNamespace[] = I18N_NAMESPACES): Promise<void> {
  await Promise.all(
    namespaces.map(async (ns) => {
      if (i18n.hasResourceBundle(lng, ns)) return
      const path = `./locales/${lng}/${ns}.json`
      const loader = loaders[path]
      if (!loader) {
        throw new Error(`Missing locale bundle: ${path}`)
      }
      let request = requests.get(path)
      if (!request) {
        request = loader().then((mod) => {
          i18n.addResourceBundle(lng, ns, mod.default, true, true)
        }).finally(() => requests.delete(path))
        requests.set(path, request)
      }
      await request
    })
  )
}

export async function ensureLocaleLoaded(lng: string): Promise<void> {
  await loadLanguageBundles(lng, [...activeNamespaces])
}

export async function ensureNamespacesLoaded(namespaces: readonly I18nNamespace[]): Promise<void> {
  for (const ns of namespaces) activeNamespaces.add(ns)
  const language = i18n.resolvedLanguage ?? i18n.language ?? readPersistedLocale()
  await Promise.all([...new Set(['en', language])].map(lng => loadLanguageBundles(lng, namespaces)))
}

const STORAGE_KEY = 'jablu-settings'

export function readPersistedLocale(): AppLocale {
  if (typeof window === 'undefined') return 'en'
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return detectAppLocale()
    const parsed = JSON.parse(raw) as { state?: { locale?: string } }
    const loc = parsed.state?.locale
    if (loc && isAppLocale(loc)) return loc
    return detectAppLocale()
  } catch {
    return detectAppLocale()
  }
}
