import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { inputFieldClassNames } from '@/components/ui/Input'
import { StatusPickerCore } from '@/components/user/StatusPickerCore'
import { cn } from '@/lib/cn'
import { useAuthStore } from '@/stores/auth.store'

export function StatusSection() {
  const { t } = useTranslation('settings')
  const user = useAuthStore((s) => s.user)
  const updateCustomStatus = useAuthStore((s) => s.updateCustomStatus)
  const [customText, setCustomText] = useState(user?.customStatus ?? '')
  const [savingCustom, setSavingCustom] = useState(false)

  const handleCustomStatusSave = async () => {
    setSavingCustom(true)
    try {
      await updateCustomStatus(customText.trim() || null)
    } catch {
      // ignore
    } finally {
      setSavingCustom(false)
    }
  }

  const handleCustomStatusClear = async () => {
    setCustomText('')
    setSavingCustom(true)
    try {
      await updateCustomStatus(null)
    } catch {
      // ignore
    } finally {
      setSavingCustom(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">
          {t('status.customStatus')}
        </label>
        <p className="text-sm text-gray-400">{t('status.customStatusHint')}</p>
        <div className="flex gap-2">
          <input
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            maxLength={128}
            placeholder={t('status.customStatusPlaceholder')}
            className={cn(inputFieldClassNames, 'min-w-0 flex-1')}
          />
          <button
            type="button"
            disabled={savingCustom || customText.trim() === (user?.customStatus ?? '')}
            onClick={() => void handleCustomStatusSave()}
            className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-text transition hover:bg-primary-hover disabled:opacity-50"
          >
            {savingCustom ? t('status.saving') : t('status.save')}
          </button>
          {user?.customStatus && (
            <button
              type="button"
              disabled={savingCustom}
              onClick={() => void handleCustomStatusClear()}
              className="rounded-md px-3 py-2 text-sm font-medium text-red-400 transition hover:bg-red-500/10 disabled:opacity-50"
            >
              {t('status.clear')}
            </button>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">
          {t('status.onlineStatus')}
        </label>
        <StatusPickerCore variant="default" />
      </div>
    </div>
  )
}
