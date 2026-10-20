import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Spinner } from '@/components/ui'
import { api, type OnboardingConfig } from '@/lib/api'
import type { Server } from '@/stores/server.store'
import { useServerStore } from '@/stores/server.store'

export function OnboardingTab({ server }: { server: Server }) {
  const { t } = useTranslation('server-settings')
  const [config, setConfig] = useState<OnboardingConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [enabled, setEnabled] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    setLoading(true)
    setError(null)
    api
      .getOnboardingConfig(server.id)
      .then((cfg) => {
        setConfig(cfg)
        setEnabled(cfg.onboardingEnabled)
        setMessage(cfg.onboardingMessage ?? '')
      })
      .catch(() => setError(t('onboarding.loadFailed')))
      .finally(() => setLoading(false))
  }, [server.id, t])

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      const updated = await api.updateOnboardingConfig(server.id, {
        enabled,
        message: message || null
      })
      setConfig(updated)
      useServerStore.getState().updateServerInList(server.id, { onboardingEnabled: enabled, onboardingMessage: message || null })
    } catch {
      setError(t('onboarding.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner size="lg" />
      </div>
    )
  }

  if (error && !config) {
    return <p className="py-8 text-center text-sm text-red-400">{error}</p>
  }

  const selfAssignableRoles = config?.roles.filter((r) => r.selfAssignable) ?? []

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-white">{t('onboarding.title')}</h2>
        <p className="mt-0.5 text-xs text-gray-400">
          {t('onboarding.description')}
        </p>
      </div>

      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="h-4 w-4 rounded border-gray-600 bg-surface-dark text-primary accent-primary"
        />
        <span className="text-sm text-gray-200">{t('onboarding.enable')}</span>
      </label>

      {enabled && (
        <>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-300">{t('onboarding.welcomeMessage')}</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t('onboarding.welcomePlaceholder')}
              maxLength={2000}
              rows={3}
              className="w-full rounded-md border border-white/10 bg-surface-dark px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-primary focus:outline-none"
            />
            <p className="mt-1 text-[11px] text-gray-500">{t('onboarding.messageLength', { count: message.length })}</p>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-300">
              {t('onboarding.selectableRoles')}
            </label>
            {selfAssignableRoles.length === 0 ? (
              <p className="text-sm text-gray-500">
                {t('onboarding.emptyRoles', {
                  rolesTab: t('tabs.roles'),
                  selfAssignable: t('roles.selfAssignable')
                })}
              </p>
            ) : (
              <>
                <p className="mb-2 text-xs text-gray-400">
                  {t('onboarding.rolesDescription')}
                </p>
                <div className="space-y-1">
                  {selfAssignableRoles.map((role) => (
                    <div
                      key={role.id}
                      className="flex items-center gap-2 rounded-md px-3 py-2 bg-white/5"
                    >
                      <span
                        className="inline-block h-3 w-3 rounded-full"
                        style={{ backgroundColor: role.color ?? '#99aab5' }}
                      />
                      <span className="text-sm text-gray-200">{role.name}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}

      <Button type="button" onClick={handleSave} disabled={saving} loading={saving}>
        {t('actions.saveChanges')}
      </Button>
    </div>
  )
}
