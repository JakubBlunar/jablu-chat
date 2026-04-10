export const APP_LOCALES = ['en', 'cs', 'sk'] as const
export type AppLocale = (typeof APP_LOCALES)[number]

export function isAppLocale(value: string): value is AppLocale {
  return (APP_LOCALES as readonly string[]).includes(value)
}

export const LOCALE_LABELS: Record<AppLocale, string> = {
  en: 'English',
  cs: 'Čeština',
  sk: 'Slovenčina'
}
