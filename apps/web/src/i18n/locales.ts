import { APP_LOCALES } from '@chat/shared'
import type { AppLocale } from '@chat/shared'

export { APP_LOCALES }
export type { AppLocale }

export function detectAppLocale(
  languages: readonly string[] = typeof navigator === 'undefined'
    ? []
    : navigator.languages?.length
      ? navigator.languages
      : [navigator.language]
): AppLocale {
  for (const language of languages) {
    const primary = language.toLowerCase().split(/[-_]/)[0]
    if (isAppLocale(primary)) return primary
  }
  return 'en'
}

export function isAppLocale(value: string): value is AppLocale {
  return (APP_LOCALES as readonly string[]).includes(value)
}

export const LOCALE_LABELS: Record<AppLocale, string> = {
  en: 'English',
  cs: 'Čeština',
  sk: 'Slovenčina'
}
