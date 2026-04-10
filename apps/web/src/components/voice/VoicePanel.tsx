import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { joinVoiceChannel } from '@/lib/voiceConnect'
import { useVoiceConnectionStore } from '@/stores/voice-connection.store'
import { CameraSettingsModal } from './CameraSettingsModal'
import { ScreenShareDialog } from './ScreenShareDialog'
import { useVoiceControls, supportsScreenShare } from './useVoiceControls'
function MicIcon({ muted }: { muted: boolean }) {
  if (muted) {
    return (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z" />
      </svg>
    )
  }
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z" />
    </svg>
  )
}

function HeadphoneIcon({ deafened }: { deafened: boolean }) {
  if (deafened) {
    return (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C6.48 2 2 6.48 2 12v4.5C2 18.43 3.57 20 5.5 20H9V12H4c0-4.42 3.58-8 8-8s8 3.58 8 8h-5v8h3.5c1.93 0 3.5-1.57 3.5-3.5V12c0-5.52-4.48-10-10-10z" />
        <line x1="3" y1="3" x2="21" y2="21" stroke="currentColor" strokeWidth="2" />
      </svg>
    )
  }
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.48 2 2 6.48 2 12v4.5C2 18.43 3.57 20 5.5 20H9V12H4c0-4.42 3.58-8 8-8s8 3.58 8 8h-5v8h3.5c1.93 0 3.5-1.57 3.5-3.5V12c0-5.52-4.48-10-10-10z" />
    </svg>
  )
}

function CameraIcon({ on }: { on: boolean }) {
  if (!on) {
    return (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M21 6.5l-4 4V7c0-.55-.45-1-1-1H9.82L21 17.18V6.5zM3.27 2L2 3.27 4.73 6H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.21 0 .39-.08.54-.18L19.73 21 21 19.73 3.27 2z" />
      </svg>
    )
  }
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" />
    </svg>
  )
}

function ScreenShareIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20 18c1.1 0 1.99-.9 1.99-2L22 6c0-1.11-.9-2-2-2H4c-1.1 0-2 .89-2 2v10c0 1.1.9 2 2 2H0v2h24v-2h-4zM4 6h16v10H4V6z" />
    </svg>
  )
}

function GearIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.488.488 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 00-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1115.6 12 3.61 3.61 0 0112 15.6z" />
    </svg>
  )
}

function DisconnectIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08c-.18-.17-.29-.42-.29-.7 0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.69-1.36-2.67-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z" />
    </svg>
  )
}

export function VoicePanel({ onGoToVoiceRoom }: { onGoToVoiceRoom?: () => void } = {}) {
  const { t } = useTranslation('voice')
  const { t: tCommon } = useTranslation('common')
  const channelId = useVoiceConnectionStore((s) => s.currentChannelId)
  const channelName = useVoiceConnectionStore((s) => s.currentChannelName)
  const voiceNetworkDropout = useVoiceConnectionStore((s) => s.voiceNetworkDropout)
  const isConnecting = useVoiceConnectionStore((s) => s.isConnecting)
  const isReconnecting = useVoiceConnectionStore((s) => s.isReconnecting)
  const micMode = useVoiceConnectionStore((s) => s.micMode)

  const vc = useVoiceControls()

  const handleShowVoiceRoom = useCallback(() => {
    if (onGoToVoiceRoom) {
      onGoToVoiceRoom()
    } else {
      useVoiceConnectionStore.getState().setViewingVoiceRoom(true)
    }
  }, [onGoToVoiceRoom])

  const handleRetryVoice = useCallback(() => {
    const d = useVoiceConnectionStore.getState().voiceNetworkDropout
    if (!d) return
    useVoiceConnectionStore.getState().clearVoiceNetworkDropout()
    void joinVoiceChannel(d.serverId, d.channelId, d.channelName)
  }, [])

  const handleDismissDropout = useCallback(() => {
    useVoiceConnectionStore.getState().clearVoiceNetworkDropout()
    useVoiceConnectionStore.getState().setViewingVoiceRoom(false)
  }, [])

  if (!channelId && !voiceNetworkDropout) return null

  const titleChannel = channelName ?? voiceNetworkDropout?.channelName ?? t('defaultChannelName')

  if (voiceNetworkDropout && !channelId) {
    return (
      <div className="border-t border-black/20 bg-surface-overlay px-3 py-2">
        {vc.errorMsg && (
          <div className="mb-1.5 rounded bg-red-500/15 px-2 py-1 text-[11px] text-red-400">{vc.errorMsg}</div>
        )}
        <div className="rounded-md bg-amber-500/10 px-2 py-2 text-[11px] text-amber-200">
          <p className="font-medium">{t('dropoutTitle', { channel: titleChannel })}</p>
          <p className="mt-0.5 text-amber-200/80">{t('dropoutHint')}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleRetryVoice}
              className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-text hover:bg-primary-hover"
            >
              {tCommon('retry')}
            </button>
            <button
              type="button"
              onClick={handleDismissDropout}
              className="rounded-md bg-white/10 px-3 py-1 text-xs font-medium text-gray-200 hover:bg-white/15"
            >
              {tCommon('dismiss')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="border-t border-black/20 bg-surface-overlay px-3 py-2">
      {vc.errorMsg && <div className="mb-1.5 rounded bg-red-500/15 px-2 py-1 text-[11px] text-red-400">{vc.errorMsg}</div>}
      {isReconnecting && (
        <div className="mb-1.5 rounded-md bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-200">
          {t('reconnectBanner')}
        </div>
      )}
      <button
        type="button"
        onClick={handleShowVoiceRoom}
        className="w-full text-left transition hover:opacity-80"
        title={t('goToVoiceRoom')}
        aria-label={t('goToVoiceRoom')}
      >
        <div className="flex items-center gap-1.5">
          <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${isConnecting || isReconnecting ? 'bg-amber-500' : 'bg-green-500'}`} />
          <span className={`min-w-0 flex-1 truncate text-xs font-medium ${isConnecting || isReconnecting ? 'text-amber-400' : 'text-green-400'}`}>
            {isConnecting ? t('connecting') : isReconnecting ? t('reconnecting') : t('connected')}
          </span>
        </div>
        <p className="mt-0.5 truncate text-xs text-gray-400">
          {titleChannel} &middot; {vc.timeStr}
          {micMode !== 'always' && (
            <span className="ml-1 text-[10px] text-gray-500">
              ({micMode === 'activity' ? t('micModeVad') : micMode === 'push-to-talk' ? t('micModePtt') : ''})
            </span>
          )}
        </p>
      </button>

      <div className="mt-2 flex items-center justify-center gap-1">
        <button
          type="button"
          title={vc.isMuted ? t('unmute') : t('mute')}
          aria-label={vc.isMuted ? t('unmute') : t('mute')}
          aria-pressed={vc.isMuted}
          onClick={vc.toggleMute}
          className={`rounded-md p-2 transition ${
            vc.isMuted ? 'bg-red-500/20 text-red-400' : 'text-gray-400 hover:bg-white/10 hover:text-white'
          }`}
        >
          <MicIcon muted={vc.isMuted} />
        </button>

        <button
          type="button"
          title={vc.isDeafened ? t('undeafen') : t('deafen')}
          aria-label={vc.isDeafened ? t('undeafen') : t('deafen')}
          aria-pressed={vc.isDeafened}
          onClick={vc.toggleDeafen}
          className={`rounded-md p-2 transition ${
            vc.isDeafened ? 'bg-red-500/20 text-red-400' : 'text-gray-400 hover:bg-white/10 hover:text-white'
          }`}
        >
          <HeadphoneIcon deafened={vc.isDeafened} />
        </button>

        <button
          type="button"
          title={vc.isCameraOn ? t('cameraOff') : t('cameraOn')}
          aria-label={vc.isCameraOn ? t('cameraOff') : t('cameraOn')}
          aria-pressed={vc.isCameraOn}
          onClick={vc.handleCameraClick}
          className={`rounded-md p-2 transition ${
            vc.isCameraOn ? 'bg-white/10 text-white' : 'text-gray-400 hover:bg-white/10 hover:text-white'
          }`}
        >
          <CameraIcon on={vc.isCameraOn} />
        </button>

        {vc.isCameraOn && (
          <button
            type="button"
            title={t('cameraSettings')}
            aria-label={t('cameraSettings')}
            onClick={() => vc.setCameraModalMode('edit')}
            className="rounded-md p-1.5 text-gray-400 transition hover:bg-white/10 hover:text-white"
          >
            <GearIcon />
          </button>
        )}

        {supportsScreenShare && (
          <button
            type="button"
            title={vc.isScreenSharing ? t('stopSharing') : t('shareScreen')}
            aria-label={vc.isScreenSharing ? t('stopSharing') : t('shareScreen')}
            aria-pressed={vc.isScreenSharing}
            onClick={vc.handleScreenShare}
            className={`rounded-md p-2 transition ${
              vc.isScreenSharing ? 'bg-primary/20 text-primary' : 'text-gray-400 hover:bg-white/10 hover:text-white'
            }`}
          >
            <ScreenShareIcon />
          </button>
        )}

        <button
          type="button"
          title={t('disconnect')}
          aria-label={t('disconnectAria')}
          onClick={vc.handleDisconnect}
          className="rounded-md p-2 text-red-400 transition hover:bg-red-500/20"
        >
          <DisconnectIcon />
        </button>
      </div>

      {vc.cameraModalMode && (
        <CameraSettingsModal
          mode={vc.cameraModalMode}
          onConfirm={vc.handleCameraConfirm}
          onClose={() => vc.setCameraModalMode(null)}
        />
      )}

      {vc.showScreenShareDialog && (
        <ScreenShareDialog onConfirm={vc.handleScreenShareConfirm} onClose={() => vc.setShowScreenShareDialog(false)} />
      )}
    </div>
  )
}
