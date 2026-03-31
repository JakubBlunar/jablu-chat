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
  const [selectedRoleIds, setSelectedRoleIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    setLoading(true)
    setError(null)
    api
      .getOnboardingConfig(server.id)
      .then((cfg) => {
        setConfig(cfg)
        setEnabled(cfg.onboardingEnabled)
        setMessage(cfg.onboardingMessage ?? '')
        setSelectedRoleIds(new Set(cfg.roles.filter((r) => r.selfAssignable).map((r) => r.id)))
      })
      .catch(() => setError('Failed to load onboarding config'))
      .finally(() => setLoading(false))
  }, [server.id])

  const toggleRole = (roleId: string) => {
    setSelectedRoleIds((prev) => {
      const next = new Set(prev)
      if (next.has(roleId)) next.delete(roleId)
      else next.add(roleId)
      return next
    })
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      const updated = await api.updateOnboardingConfig(server.id, {
        enabled,
        message: message || null,
        selfAssignableRoleIds: [...selectedRoleIds]
      })
      setConfig(updated)
      setSelectedRoleIds(new Set(updated.roles.filter((r) => r.selfAssignable).map((r) => r.id)))
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

  const nonDefaultRoles = config?.roles.filter((r) => !r.isDefault) ?? []

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-white">Onboarding</h2>
        <p className="mt-0.5 text-xs text-gray-400">
          Configure a welcome wizard for new members to pick a role when they join
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
            <p className="mb-3 text-xs text-gray-400">
              New members can pick one of these roles during onboarding. This determines which channels they can see.
            </p>
            {nonDefaultRoles.length === 0 ? (
              <p className="text-sm text-gray-500">
                No custom roles created yet. Create roles in the Roles tab first.
              </p>
            ) : (
              <div className="space-y-1.5">
                {nonDefaultRoles.map((role) => (
                  <label
                    key={role.id}
                    className="flex items-center gap-3 rounded-md px-3 py-2 hover:bg-white/5"
                  >
                    <input
                      type="checkbox"
                      checked={selectedRoleIds.has(role.id)}
                      onChange={() => toggleRole(role.id)}
                      className="h-4 w-4 rounded border-gray-600 bg-surface-dark text-primary accent-primary"
                    />
                    <span className="flex items-center gap-2 text-sm text-gray-200">
                      {role.color && (
                        <span
                          className="inline-block h-3 w-3 rounded-full"
                          style={{ backgroundColor: role.color }}
                        />
                      )}
                      {role.name}
                    </span>
                  </label>
                ))}
              </div>
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
