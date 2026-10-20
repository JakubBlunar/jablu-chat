import { useTranslation } from 'react-i18next'
import { APP_LOCALES, isAppLocale, LOCALE_LABELS } from '@/i18n/locales'
import { useSettingsStore } from '@/stores/settings.store'

export function PublicLocaleSwitcher() {
  const { t } = useTranslation('auth')
  const locale = useSettingsStore((state) => state.locale)
  const setLocale = useSettingsStore((state) => state.setLocale)

  return (
    <div className="mb-3 flex w-full max-w-[420px] justify-end">
      <label htmlFor="auth-locale-select" className="sr-only">
        {t('language')}
      </label>
      <div className="relative">
        <select
          id="auth-locale-select"
          value={locale}
          onChange={(event) => {
            const nextLocale = event.target.value
            if (isAppLocale(nextLocale)) setLocale(nextLocale)
          }}
          className="appearance-none rounded-md bg-surface-dark py-1.5 pl-3 pr-9 text-sm text-gray-300 ring-1 ring-white/10 transition focus:outline-none focus:ring-2 focus:ring-primary"
        >
          {APP_LOCALES.map((code) => (
            <option key={code} value={code}>
              {LOCALE_LABELS[code]}
            </option>
          ))}
        </select>
        <svg
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
        </svg>
      </div>
    </div>
  )
}
