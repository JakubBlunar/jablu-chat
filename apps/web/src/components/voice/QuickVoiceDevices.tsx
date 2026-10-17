import { useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { changeVoiceDevice, reportVoiceDeviceError } from '@/lib/voiceDevices'
import { useSettingsStore } from '@/stores/settings.store'

const kinds = ['audioinput', 'audiooutput', 'videoinput'] as const

export function QuickVoiceDevices() {
  const { t } = useTranslation('voice')
  const id = useId()
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const audioInput = useSettingsStore((s) => s.audioInputDeviceId)
  const audioOutput = useSettingsStore((s) => s.audioOutputDeviceId)
  const camera = useSettingsStore((s) => s.cameraDeviceId)
  const values = { audioinput: audioInput, audiooutput: audioOutput, videoinput: camera }

  useEffect(() => {
    let active = true
    const refresh = () => {
      if (!navigator.mediaDevices?.enumerateDevices) {
        setError(true)
        return
      }
      void navigator.mediaDevices
        .enumerateDevices()
        .then((list) => {
          if (active) {
            setDevices(list)
            setError(false)
          }
        })
        .catch((error: unknown) => {
          console.error('Failed to list voice devices:', error)
          if (active) setError(true)
        })
    }
    refresh()
    navigator.mediaDevices?.addEventListener('devicechange', refresh)
    return () => {
      active = false
      navigator.mediaDevices?.removeEventListener('devicechange', refresh)
    }
  }, [])

  return (
    <div className="space-y-2 rounded-md bg-surface-darkest p-2">
      {error && (
        <p role="alert" className="text-xs text-red-400">
          {t('deviceError')}
        </p>
      )}
      {kinds.map((kind) => {
        if (kind === 'audiooutput' && !('setSinkId' in HTMLMediaElement.prototype)) return null
        const available = devices.filter(
          (device) => device.kind === kind && device.deviceId && device.deviceId !== 'default'
        )
        return (
          <div key={kind}>
            <label htmlFor={`${id}-${kind}`} className="mb-1 block text-xs text-gray-300">
              {t(kind)}
            </label>
            <select
              id={`${id}-${kind}`}
              className="w-full rounded bg-surface px-2 py-1 text-xs text-white"
              value={values[kind]}
              disabled={busy}
              onChange={(event) => {
                setBusy(true)
                setError(false)
                void changeVoiceDevice(kind, event.target.value)
                  .catch((error: unknown) => {
                    setError(true)
                    reportVoiceDeviceError(error)
                  })
                  .finally(() => setBusy(false))
              }}
            >
              <option value="">{t('systemDefault')}</option>
              {values[kind] && !available.some((device) => device.deviceId === values[kind]) && (
                <option value={values[kind]} disabled>
                  {t('deviceUnavailable')}
                </option>
              )}
              {available.map((device, index) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label || `${t(kind)} ${index + 1}`}
                </option>
              ))}
            </select>
          </div>
        )
      })}
    </div>
  )
}
