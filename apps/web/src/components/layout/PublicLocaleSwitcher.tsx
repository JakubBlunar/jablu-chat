import { Select } from '@/components/ui/Select'
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
      <Select
        id="auth-locale-select"
        value={locale}
        onChange={(event) => {
          const nextLocale = event.target.value
          if (isAppLocale(nextLocale)) setLocale(nextLocale)
        }}
        size="sm"
      >
        {APP_LOCALES.map((code) => (
          <option key={code} value={code}>
            {LOCALE_LABELS[code]}
          </option>
        ))}
      </Select>
    </div>
  )
}
