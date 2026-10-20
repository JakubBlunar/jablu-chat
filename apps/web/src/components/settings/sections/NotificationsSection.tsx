import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  getNotifSettings,
  saveNotifSettings,
  requestPermission,
  showNotification,
  subscribeToPush,
  unsubscribeFromPush
} from '@/lib/notifications'
import { ToggleRow } from '@/components/settings/ToggleRow'
import { Button } from '@/components/ui'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth.store'
import { PushDeliverySettings } from '@/components/settings/sections/PushDeliverySettings'
import { isDesktop } from '@/lib/desktop'

export function NotificationsSection() {
  const { t } = useTranslation('settings')
  const [settings, setSettings] = useState(getNotifSettings)
  const [permStatus, setPermStatus] = useState<string>(
    'Notification' in window ? Notification.permission : 'unsupported'
  )
  const [pushStatus, setPushStatus] = useState<'checking' | 'active' | 'inactive' | 'error'>('checking')
  const [pushError, setPushError] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<string | null>(null)
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
          await subscribeToPush(accessToken, true)
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
        await subscribeToPush(accessToken, true)
        const reg = await navigator.serviceWorker.ready
        const sub = await reg.pushManager.getSubscription()
        setPushStatus(sub ? 'active' : 'error')
        setPushError(sub ? null : t('notifications.pushSubscriptionMissing'))
      } catch (e: unknown) {
        setPushStatus('error')
        setPushError(e instanceof Error ? e.message : t('notifications.pushSubscriptionFailed'))
      }
    }
  }

  const handleEnablePush = async () => {
    if (!accessToken) return
    setPushError(null)
    try {
      await subscribeToPush(accessToken, true)
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      setPushStatus(sub ? 'active' : 'error')
      if (!sub) setPushError(t('notifications.pushSubscriptionMissing'))
    } catch (e: unknown) {
      setPushStatus('error')
      setPushError(e instanceof Error ? e.message : t('notifications.pushSubscriptionFailed'))
    }
  }

  const handleTestNotification = async () => {
    setTestResult(null)
    // Local first, so a failure here isolates the OS/permission layer from the
    // server-to-device push transport that follows.
    showNotification(t('notifications.testNotificationTitle'), t('notifications.testNotificationBody'), '/channels/@me')
    try {
      const res = await api.post<{ devices: number }>('/push/test', {})
      setTestResult(
        res.devices > 0
          ? t('notifications.sentToDevices', { count: res.devices })
          : t('notifications.noRegisteredDevices')
      )
    } catch (e: unknown) {
      setTestResult(e instanceof Error ? e.message : t('notifications.testPushFailed'))
    }
  }

  const isBrave = 'brave' in navigator

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-400">{t('notifications.description')}</p>

      {!isDesktop && permStatus !== 'granted' && permStatus !== 'unsupported' && (
        <div className="rounded-lg bg-surface-dark p-4">
          <p className="text-sm text-gray-300">
            {t(permStatus === 'denied' ? 'notifications.browserBlocked' : 'notifications.browserNotEnabled')}
          </p>
          {permStatus !== 'denied' && (
            <Button type="button" variant="primary" className="mt-2" onClick={() => void handleRequestPermission()}>
              {t('notifications.enableNotifications')}
            </Button>
          )}
          {permStatus === 'denied' && <p className="mt-1 text-xs text-gray-500">{t('notifications.blockedHint')}</p>}
        </div>
      )}

      {!isDesktop && permStatus === 'granted' && (
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
                ? t('notifications.pushActive')
                : pushStatus === 'checking'
                  ? t('notifications.checkingPush')
                  : t('notifications.pushInactive')}
            </p>
          </div>
          {pushStatus === 'active' && <p className="mt-1 text-xs text-gray-500">{t('notifications.appClosedHint')}</p>}
          {(pushStatus === 'inactive' || pushStatus === 'error') && (
            <>
              <Button type="button" variant="primary" className="mt-2" onClick={() => void handleEnablePush()}>
                {t('notifications.enablePush')}
              </Button>
              {pushError && <p className="mt-2 text-xs text-red-400">{pushError}</p>}
            </>
          )}
        </div>
      )}

      {!isDesktop && permStatus === 'granted' && pushStatus !== 'active' && pushStatus !== 'checking' && (
        <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-4">
          <p className="text-sm font-medium text-yellow-400">{t('notifications.troubleshooting')}</p>
          <ul className="mt-2 space-y-1.5 text-xs text-gray-400">
            {isBrave && (
              <li>
                <strong className="text-gray-300">{t('notifications.braveBrowser')}:</strong>{' '}
                {t('notifications.braveGoTo')}{' '}
                <span className="rounded bg-surface-darkest px-1.5 py-0.5 font-mono text-gray-300">
                  brave://settings/privacy
                </span>{' '}
                {t('notifications.braveEnable')}{' '}
                <strong className="text-gray-300">"{t('notifications.braveServicesOption')}"</strong>.{' '}
                {t('notifications.braveRequired')}
              </li>
            )}
            <li>{t('notifications.osPermissionHint')}</li>
            <li>{t('notifications.vpnHint')}</li>
            <li>{t('notifications.retryHint')}</li>
          </ul>
        </div>
      )}

      <div className="space-y-3">
        <ToggleRow
          label={t('notifications.notificationsLabel')}
          description={t('notifications.notificationsDescription')}
          checked={settings.enabled}
          onChange={() => toggle('enabled')}
        />
        <ToggleRow
          label={t('notifications.soundLabel')}
          description={t('notifications.soundDescription')}
          checked={settings.soundEnabled}
          onChange={() => toggle('soundEnabled')}
        />
      </div>

      <div className="rounded-lg bg-surface-dark p-4">
        <p className="text-sm font-medium text-gray-200">{t('notifications.testDevice')}</p>
        <p className="mt-1 text-xs text-gray-500">{t('notifications.testDeviceDescription')}</p>
        <Button type="button" variant="secondary" className="mt-2" onClick={() => void handleTestNotification()}>
          {t('notifications.sendTest')}
        </Button>
        {testResult && <p className="mt-2 text-xs text-gray-400">{testResult}</p>}
      </div>

      <PushDeliverySettings />
    </div>
  )
}
