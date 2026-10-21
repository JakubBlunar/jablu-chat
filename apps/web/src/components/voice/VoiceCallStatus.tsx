import { useTranslation } from 'react-i18next'
import { useVoiceConnectionStore } from '@/stores/voice-connection.store'

export function VoiceCallStatus() {
  const { t } = useTranslation('voice')
  const room = useVoiceConnectionStore((s) => s.room)
  const error = useVoiceConnectionStore((s) => s.microphoneError)
  const pending = useVoiceConnectionStore((s) => s.isMicrophonePending)
  const deafened = useVoiceConnectionStore((s) => s.isDeafened)
  const blocked = useVoiceConnectionStore((s) => s.playbackBlocked)
  const outputError = useVoiceConnectionStore((s) => s.audioOutputError)
  if (!room || (!error && !pending && !blocked && !outputError)) return null
  return (
    <div className="space-y-2 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
      {pending && <p role="status">{t('microphoneStarting')}</p>}
      {error && (
        <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <p className="flex-1 basis-48">
            {t(error === 'permission' ? 'microphonePermissionError' : 'microphoneDeviceError')}
          </p>
          <button
            type="button"
            disabled={deafened || pending}
            className="min-h-11 rounded-md px-3 font-medium underline disabled:opacity-50"
            onClick={() => {
              void useVoiceConnectionStore.getState().requestMicrophone(true)
            }}
          >
            {t('retryMicrophone')}
          </button>
          <button
            type="button"
            className="min-h-11 rounded-md px-3 underline"
            onClick={() => window.dispatchEvent(new CustomEvent('open-settings', { detail: 'voice' }))}
          >
            {t('audioSettings')}
          </button>
        </div>
      )}
      {blocked && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2">
          <span>{t('playbackBlocked')}</span>
          <button
            type="button"
            className="min-h-11 rounded-md px-3 font-medium underline"
            onClick={() => window.dispatchEvent(new Event('voice:resume-audio'))}
          >
            {t('enableAudio')}
          </button>
        </div>
      )}
      {outputError && (
        <p role="alert">
          {t('audioOutputError')}{' '}
          <button
            type="button"
            className="min-h-11 px-2 underline"
            onClick={() => window.dispatchEvent(new CustomEvent('open-settings', { detail: 'voice' }))}
          >
            {t('audioSettings')}
          </button>
        </p>
      )}
    </div>
  )
}
