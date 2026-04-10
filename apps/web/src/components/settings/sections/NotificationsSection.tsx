import { useEffect, useState } from 'react'
import {
  getNotifSettings,
  saveNotifSettings,
  requestPermission,
  subscribeToPush,
  unsubscribeFromPush
} from '@/lib/notifications'
import { ToggleRow } from '@/components/settings/ToggleRow'
import { Button } from '@/components/ui'
import { useAuthStore } from '@/stores/auth.store'
import { PushDeliverySettings } from '@/components/settings/sections/PushDeliverySettings'

export function NotificationsSection() {
  const [settings, setSettings] = useState(getNotifSettings)
  const [permStatus, setPermStatus] = useState<string>(
    'Notification' in window ? Notification.permission : 'unsupported'
  )
  const [pushStatus, setPushStatus] = useState<'checking' | 'active' | 'inactive' | 'error'>('checking')
  const [pushError, setPushError] = useState<string | null>(null)
  const accessToken = useAuthStore((s) => s.accessToken)

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setPushStatus('inactive')
      return
    }
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setPushStatus(sub ? 'active' : 'inactive'))
      .catch(() => setPushStatus('error'))
  }, [])

  const toggle = async (key: 'enabled' | 'soundEnabled') => {
    const next = { ...settings, [key]: !settings[key] }
    setSettings(next)
    saveNotifSettings(next)

    if (key === 'enabled' && accessToken) {
      if (!next.enabled) {
        try {
          await unsubscribeFromPush(accessToken)
          setPushStatus('inactive')
        } catch {
          /* non-critical */
        }
      } else if (permStatus === 'granted') {
        try {
          await subscribeToPush(accessToken)
          const reg = await navigator.serviceWorker.ready
          const sub = await reg.pushManager.getSubscription()
          setPushStatus(sub ? 'active' : 'inactive')
        } catch {
          /* non-critical */
        }
      }
    }
  }

  const handleRequestPermission = async () => {
    const granted = await requestPermission()
    setPermStatus(granted ? 'granted' : 'denied')
    if (granted && accessToken) {
      try {
        await subscribeToPush(accessToken)
        const reg = await navigator.serviceWorker.ready
        const sub = await reg.pushManager.getSubscription()
        setPushStatus(sub ? 'active' : 'error')
        setPushError(sub ? null : 'Push subscription failed. See troubleshooting below.')
      } catch (e: unknown) {
        setPushStatus('error')
        setPushError(e instanceof Error ? e.message : 'Push subscription failed')
      }
    }
  }

  const handleEnablePush = async () => {
    if (!accessToken) return
    setPushError(null)
    try {
      await subscribeToPush(accessToken)
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      setPushStatus(sub ? 'active' : 'error')
      if (!sub) setPushError('Push subscription failed. See troubleshooting below.')
    } catch (e: unknown) {
      setPushStatus('error')
      setPushError(e instanceof Error ? e.message : 'Push subscription failed')
    }
  }

  const isBrave = 'brave' in navigator

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-400">Control how Jablu notifies you about new messages.</p>

      {permStatus !== 'granted' && permStatus !== 'unsupported' && (
        <div className="rounded-lg bg-surface-dark p-4">
          <p className="text-sm text-gray-300">
            Browser notifications are {permStatus === 'denied' ? 'blocked' : 'not enabled'}.
          </p>
          {permStatus !== 'denied' && (
            <Button type="button" variant="primary" className="mt-2" onClick={() => void handleRequestPermission()}>
              Enable Notifications
            </Button>
          )}
          {permStatus === 'denied' && (
            <p className="mt-1 text-xs text-gray-500">
              You have blocked notifications for this site. Update your browser settings to allow them.
            </p>
          )}
        </div>
      )}

      {permStatus === 'granted' && (
        <div className="rounded-lg bg-surface-dark p-4">
          <div className="flex items-center gap-2">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                pushStatus === 'active'
                  ? 'bg-green-500'
                  : pushStatus === 'error'
                    ? 'bg-red-500'
                    : pushStatus === 'inactive'
                      ? 'bg-yellow-500'
                      : 'bg-gray-500'
              }`}
            />
            <p className="text-sm font-medium text-gray-200">
              {pushStatus === 'active'
                ? 'Push notifications are active'
                : pushStatus === 'checking'
                  ? 'Checking push status...'
                  : 'Push notifications are not active'}
            </p>
          </div>
          {pushStatus === 'active' && (
            <p className="mt-1 text-xs text-gray-500">You will receive notifications even when the app is closed.</p>
          )}
          {(pushStatus === 'inactive' || pushStatus === 'error') && (
            <>
              <Button type="button" variant="primary" className="mt-2" onClick={() => void handleEnablePush()}>
                Enable Push Notifications
              </Button>
              {pushError && <p className="mt-2 text-xs text-red-400">{pushError}</p>}
            </>
          )}
        </div>
      )}

      {permStatus === 'granted' && pushStatus !== 'active' && pushStatus !== 'checking' && (
        <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-4">
          <p className="text-sm font-medium text-yellow-400">Troubleshooting</p>
          <ul className="mt-2 space-y-1.5 text-xs text-gray-400">
            {isBrave && (
              <li>
                <strong className="text-gray-300">Brave Browser:</strong> Go to{' '}
                <span className="rounded bg-surface-darkest px-1.5 py-0.5 font-mono text-gray-300">
                  brave://settings/privacy
                </span>{' '}
                and enable <strong className="text-gray-300">"Use Google services for push messaging"</strong>. This is
                required for push notifications to work.
              </li>
            )}
            <li>Make sure notifications are allowed in your operating system settings for this browser.</li>
            <li>If you are using a VPN or firewall, ensure it does not block push service connections.</li>
            <li>Try closing all tabs and reopening the app, then click "Enable Push Notifications" again.</li>
          </ul>
        </div>
      )}

      <div className="space-y-3">
        <ToggleRow
          label="Notifications"
          description="Show notifications when you receive new messages"
          checked={settings.enabled}
          onChange={() => toggle('enabled')}
        />
        <ToggleRow
          label="Notification Sound"
          description="Play a sound when you receive a notification"
          checked={settings.soundEnabled}
          onChange={() => toggle('soundEnabled')}
        />
      </div>

      <PushDeliverySettings />
    </div>
  )
}
