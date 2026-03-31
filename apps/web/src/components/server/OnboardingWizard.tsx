import { useEffect, useState } from 'react'
import { Spinner } from '@/components/ui'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth.store'
import { useMemberStore } from '@/stores/member.store'
import { useServerStore } from '@/stores/server.store'

type SelectableRole = {
  id: string
  name: string
  color: string | null
}

export function OnboardingWizard() {
  const currentServerId = useServerStore((s) => s.currentServerId)
  const currentServer = useServerStore((s) => s.servers.find((sv) => sv.id === s.currentServerId))
  const userId = useAuthStore((s) => s.user?.id)
  const members = useMemberStore((s) => s.members)

  const myMember = members.find((m) => m.userId === userId && m.serverId === currentServerId)
  const needsOnboarding =
    currentServer?.onboardingEnabled && myMember && myMember.onboardingCompleted === false

  const [roles, setRoles] = useState<SelectableRole[]>([])
  const [selectedRoleIds, setSelectedRoleIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!needsOnboarding || !currentServerId) return
    setLoading(true)
    api
      .getOnboardingWizard(currentServerId)
      .then((cfg) => {
        setRoles(cfg.roles)
      })
      .catch(() => setRoles([]))
      .finally(() => setLoading(false))
  }, [needsOnboarding, currentServerId])

  if (!needsOnboarding) return null

  const toggleRole = (roleId: string) => {
    setSelectedRoleIds((prev) => {
      const next = new Set(prev)
      if (next.has(roleId)) next.delete(roleId)
      else next.add(roleId)
      return next
    })
  }

  const handleComplete = async () => {
    if (!currentServerId) return
    setSubmitting(true)
    try {
      const ids = Array.from(selectedRoleIds)
      await api.completeOnboarding(currentServerId, ids.length > 0 ? ids : undefined)
      useMemberStore.getState().updateMemberOnboarding(currentServerId, userId!, true)
      await useMemberStore.getState().fetchMembers(currentServerId)
    } catch {
      // Still dismiss on error to not block the user
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-md rounded-xl bg-surface-dark p-6 shadow-2xl ring-1 ring-white/10">
        <div className="mb-1 text-center">
          <h2 className="text-xl font-bold text-white">
            Welcome to {currentServer?.name}!
          </h2>
          {currentServer?.onboardingMessage && (
            <p className="mt-2 text-sm text-gray-300">{currentServer.onboardingMessage}</p>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <Spinner size="lg" />
          </div>
        ) : roles.length > 0 ? (
          <div className="mt-5">
            <p className="mb-3 text-sm font-medium text-gray-300">Choose your roles:</p>
            <div className="max-h-60 space-y-1.5 overflow-y-auto pr-1">
              {roles.map((role) => {
                const isSelected = selectedRoleIds.has(role.id)
                return (
                  <button
                    key={role.id}
                    type="button"
                    onClick={() => toggleRole(role.id)}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition ${
                      isSelected
                        ? 'bg-primary/20 ring-1 ring-primary'
                        : 'bg-white/5 hover:bg-white/10'
                    }`}
                  >
                    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                      isSelected ? 'border-primary bg-primary' : 'border-gray-600'
                    }`}>
                      {isSelected && (
                        <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </span>
                    {role.color ? (
                      <span
                        className="h-4 w-4 shrink-0 rounded-full"
                        style={{ backgroundColor: role.color }}
                      />
                    ) : (
                      <span className="h-4 w-4 shrink-0 rounded-full bg-gray-600" />
                    )}
                    <span className="text-sm font-medium text-white">{role.name}</span>
                  </button>
                )
              })}
            </div>
          </div>
        ) : null}

        <button
          type="button"
          onClick={handleComplete}
          disabled={submitting}
          className="mt-6 w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:opacity-50"
        >
          {submitting ? 'Getting you set up...' : roles.length > 0 ? 'Continue' : 'Get Started'}
        </button>
      </div>
    </div>
  )
}
