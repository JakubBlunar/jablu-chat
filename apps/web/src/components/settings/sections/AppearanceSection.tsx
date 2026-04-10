import { useTranslation } from 'react-i18next'
import { ACCENT_OPTIONS } from '@/lib/accent'
import { APP_LOCALES, LOCALE_LABELS, type AppLocale } from '@/i18n/locales'
import { useSettingsStore } from '@/stores/settings.store'

export function AppearanceSection() {
  const { t } = useTranslation('settings')
  const accent = useSettingsStore((s) => s.accent)
  const setAccent = useSettingsStore((s) => s.setAccent)
  const locale = useSettingsStore((s) => s.locale)
  const setLocale = useSettingsStore((s) => s.setLocale)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-1 text-base font-semibold text-white">{t('appearance.language')}</h2>
        <p className="mb-3 text-sm text-gray-400">{t('appearance.languageHint')}</p>
        <label htmlFor="jablu-locale-select" className="sr-only">
          {t('appearance.language')}
        </label>
        <select
          id="jablu-locale-select"
          value={locale}
          onChange={(e) => setLocale(e.target.value as AppLocale)}
          className="w-full max-w-xs rounded-md bg-surface-darkest px-3 py-2 text-sm text-white outline-none ring-1 ring-white/10"
        >
          {APP_LOCALES.map((code) => (
            <option key={code} value={code}>
              {LOCALE_LABELS[code]}
            </option>
          ))}
        </select>
      </div>

      <div className="border-t border-white/10 pt-6">
        <h2 className="mb-1 text-base font-semibold text-white">{t('appearance.accentTitle')}</h2>
        <p className="mb-4 text-sm text-gray-400">{t('appearance.accentHint')}</p>

        <div className="flex flex-wrap gap-3">
          {ACCENT_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setAccent(opt.key)}
              className={`flex items-center gap-2.5 rounded-lg px-4 py-2.5 text-sm font-medium transition ${
                accent === opt.key
                  ? 'ring-2 ring-white/30 bg-white/10 text-white'
                  : 'bg-surface-darkest text-gray-300 hover:bg-white/[0.06]'
              }`}
            >
              <span
                className="h-4 w-4 shrink-0 rounded-full"
                style={{ backgroundColor: opt.color }}
              />
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="border-t border-white/10 pt-6">
        <h2 className="mb-1 text-base font-semibold text-white">{t('appearance.themeTitle')}</h2>
        <p className="text-sm text-gray-400">{t('appearance.themeHint')}</p>
      </div>
    </div>
  )
}
