import { useEffect, useState } from 'react'
import { Spinner } from '@/components/ui'
import { api, type OnboardingConfig } from '@/lib/api'
import type { Server } from '@/stores/server.store'
import { useServerStore } from '@/stores/server.store'

export function OnboardingTab({ server }: { server: Server }) {
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
      .catch(() => setError('Failed to load onboarding config'))
      .finally(() => setLoading(false))
  }, [server.id])

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
      setError('Failed to save onboarding config')
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
        <h2 className="text-base font-semibold text-white">Onboarding</h2>
        <p className="mt-0.5 text-xs text-gray-400">
          Configure a welcome wizard for new members when they join
        </p>
      </div>

      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="h-4 w-4 rounded border-gray-600 bg-surface-dark text-primary accent-primary"
        />
        <span className="text-sm text-gray-200">Enable onboarding for new members</span>
      </label>

      {enabled && (
        <>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-300">Welcome Message</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Welcome to the server! Pick a role to get started."
              maxLength={2000}
              rows={3}
              className="w-full rounded-md border border-white/10 bg-surface-dark px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-primary focus:outline-none"
            />
            <p className="mt-1 text-[11px] text-gray-500">{message.length}/2000</p>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-300">
              Selectable Roles
            </label>
            {selfAssignableRoles.length === 0 ? (
              <p className="text-sm text-gray-500">
                No roles are marked as self-assignable. Go to the <strong className="text-gray-300">Roles</strong> tab and
                enable "Self-assignable" on the roles you want new members to choose from.
              </p>
            ) : (
              <>
                <p className="mb-2 text-xs text-gray-400">
                  These roles are available for members to pick during onboarding and from their profile.
                  Manage them in the Roles tab.
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

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary/90 disabled:opacity-50"
      >
        {saving ? 'Saving...' : 'Save Changes'}
      </button>
    </div>
  )
}
