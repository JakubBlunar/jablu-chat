import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Spinner } from '@/components/ui'
import { useTranslationStore } from '@/stores/translation.store'
import { showToast } from '@/stores/toast.store'

/**
 * Default target language for message translation. The whole section is
 * capability-gated: it renders nothing when the server has no translation
 * configured. Setup failures remain visible and can be retried.
 * Saving is immediate — same pattern as the interface-language select above.
 */
export function TranslationPreferenceSection() {
  const { t } = useTranslation('settings')
  const capabilities = useTranslationStore((s) => s.capabilities)
  const capabilitiesLoaded = useTranslationStore((s) => s.capabilitiesLoaded)
  const capabilitiesError = useTranslationStore((s) => s.capabilitiesError)
  const preferenceLoaded = useTranslationStore((s) => s.preferenceLoaded)
  const preferenceError = useTranslationStore((s) => s.preferenceError)
  const targetLang = useTranslationStore((s) => s.targetLang)
  const fetchCapabilities = useTranslationStore((s) => s.fetchCapabilities)
  const loadPreference = useTranslationStore((s) => s.loadPreference)
  const savePreference = useTranslationStore((s) => s.savePreference)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    void fetchCapabilities()
    void loadPreference()
  }, [fetchCapabilities, loadPreference])

  const setupFailed = capabilitiesError || (preferenceError && !preferenceLoaded)
  const available = capabilitiesLoaded && capabilities?.enabled && capabilities.languages.length > 0

  if (!setupFailed && !available) {
    return null
  }

  const handleChange = async (value: string) => {
    if (saving) return
    setSaving(true)
    try {
      // '' = reset to auto (the modal pre-selects the interface language).
      await savePreference(value === '' ? null : value)
    } catch {
      showToast(t('appearance.translateErrorTitle'), t('translationPreferenceFailed', { ns: 'chat' }))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="border-t border-white/10 pt-6">
      <h2 className="mb-1 text-base font-semibold text-white">{t('appearance.translateTitle')}</h2>
      <p className="mb-3 text-sm text-gray-400">{t('appearance.translateHint')}</p>
      {setupFailed && (
        <div className="mb-3 text-sm">
          <p role="alert" className="text-red-400">
            {t('translationSetupFailed', { ns: 'chat' })}
          </p>
          <button
            type="button"
            onClick={() => {
              void fetchCapabilities()
              void loadPreference()
            }}
            className="mt-2 rounded text-primary hover:underline"
          >
            {t('translationSetupRetry', { ns: 'chat' })}
          </button>
        </div>
      )}
      {available && (
        <div className="relative max-w-xs">
          <select
            id="jablu-translation-lang-select"
            aria-label={t('appearance.translateTitle')}
            value={targetLang ?? ''}
            onChange={(e) => void handleChange(e.target.value)}
            disabled={saving || !preferenceLoaded}
            className="w-full appearance-none rounded-md bg-surface-darkest px-3 py-2 pr-8 text-sm text-white outline-none ring-1 ring-white/10 transition focus:ring-2 focus:ring-primary disabled:opacity-60"
          >
            <option value="">{t('appearance.translateAuto')}</option>
            {capabilities!.languages.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.name}
              </option>
            ))}
          </select>
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
            {saving ? (
              <Spinner size="sm" />
            ) : (
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M6 9l6 6 6-6" />
              </svg>
            )}
          </span>
        </div>
      )}
    </div>
  )
}
