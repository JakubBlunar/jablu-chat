import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ModalOverlay } from '@/components/ui/ModalOverlay'
import { Spinner } from '@/components/ui'
import { CheckIcon } from '@/components/chat/chatIcons'
import { useTranslationStore } from '@/stores/translation.store'
import { showToast } from '@/stores/toast.store'
import { i18n } from '@/i18n/config'
import { isAppLocale } from '@/i18n/locales'

type Props = {
  messageId: string
  /** Preselect this language (re-picking from the rendered translation block). */
  initialTarget?: string
  onClose: () => void
}

/**
 * Language picker for on-demand message translation. Opened when the user has
 * no default target yet, or when they re-pick the language of an existing
 * translation. Saves the choice as the default when "remember" is on.
 */
export function TranslateModal({ messageId, initialTarget, onClose }: Props) {
  const { t } = useTranslation('chat')
  const capabilities = useTranslationStore((s) => s.capabilities)
  const storedTarget = useTranslationStore((s) => s.targetLang)
  const savePreference = useTranslationStore((s) => s.savePreference)
  const translate = useTranslationStore((s) => s.translate)

  const languages = capabilities?.languages ?? []
  const currentLocale = isAppLocale(i18n.language) ? i18n.language : 'en'

  // Default target: explicit re-pick, stored preference, else the user's UI
  // language when supported, else the first configured language.
  const defaultTarget =
    initialTarget ?? storedTarget ?? (languages.some((l) => l.code === currentLocale) ? currentLocale : languages[0]?.code ?? '')
  const [selected, setSelected] = useState<string | null>(null)
  const activeTarget = selected ?? defaultTarget
  const [remember, setRemember] = useState<boolean>(storedTarget == null)
  const [busy, setBusy] = useState(false)

  const targets = useMemo(
    () => (activeTarget ? languages.filter((l) => l.code !== activeTarget) : languages),
    [languages, activeTarget]
  )

  const handleTranslate = async (target: string) => {
    if (busy) return
    setBusy(true)
    if (remember && target !== storedTarget) {
      try {
        await savePreference(target)
      } catch {
        // Saving the pref is best-effort; translation still proceeds.
      }
    }
    const err = await translate(messageId, target)
    if (err) {
      setBusy(false)
      showToast(t('translateErrorTitle'), t('translateErrorMessage'))
      return
    }
    onClose()
  }

  return (
    <ModalOverlay onClose={onClose} maxWidth="max-w-sm">
      <div className="flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-semibold text-white">{t('translateTitle')}</h2>
          <p className="mt-0.5 text-sm text-gray-400">{t('translateSubtitle')}</p>
        </div>

        {busy ? (
          <div className="flex items-center justify-center gap-2 rounded-lg bg-surface-darkest p-4 text-sm text-gray-300">
            <Spinner size="sm" />
            {t('translateWorking')}
          </div>
        ) : (
          <div className="flex flex-col gap-1.5" role="radiogroup" aria-label={t('translateTitle')}>
            {targets.map((lang) => (
              <button
                key={lang.code}
                type="button"
                role="radio"
                aria-checked={lang.code === activeTarget}
                onClick={() => {
                  // Re-selecting the currently-active target keeps it (no-op).
                  if (lang.code !== activeTarget) setSelected(lang.code)
                  void handleTranslate(lang.code)
                }}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm transition ${
                  lang.code === activeTarget
                    ? 'bg-primary/20 text-white ring-1 ring-primary/40'
                    : 'bg-surface-darkest text-gray-200 hover:bg-white/5'
                }`}
              >
                <span>{lang.name}</span>
                <span className="flex h-4 w-4 items-center justify-center">
                  {lang.code === activeTarget && <CheckIcon className="h-3.5 w-3.5" />}
                </span>
              </button>
            ))}
          </div>
        )}

        <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-300">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="h-4 w-4 rounded border-white/20 bg-surface-darkest accent-primary"
          />
          {t('translateRemember')}
        </label>
      </div>
    </ModalOverlay>
  )
}
