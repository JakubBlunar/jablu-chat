import type { DmPrivacy } from '@chat/shared'
import { useState } from 'react'
import { ToggleRow } from '@/components/settings/ToggleRow'
import { useAuthStore } from '@/stores/auth.store'

export function PrivacySection() {
  const user = useAuthStore((s) => s.user)
  const updateDmPrivacy = useAuthStore((s) => s.updateDmPrivacy)
  const [loading, setLoading] = useState(false)

  const current: DmPrivacy = user?.dmPrivacy ?? 'everyone'

  const handleToggle = async () => {
    const next: DmPrivacy = current === 'everyone' ? 'friends_only' : 'everyone'
    setLoading(true)
    try {
      await updateDmPrivacy(next)
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-400">Control who can send you direct messages.</p>

      <div className="space-y-3">
        <div className={loading ? 'pointer-events-none opacity-60' : ''}>
          <ToggleRow
            label="Friends Only DMs"
            description="Only allow friends to start new direct message conversations with you"
            checked={current === 'friends_only'}
            onChange={() => void handleToggle()}
          />
        </div>
        {current === 'friends_only' && (
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3">
            <p className="text-xs text-amber-300">
              Non-friends will not be able to find you or start new conversations with you. Existing conversations will not be affected.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
