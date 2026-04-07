import { Room, RoomEvent } from 'livekit-client'
import { api } from '@/lib/api'
import { getValidatedDevices } from '@/lib/deviceSettings'
import { getNotifSettings } from '@/lib/notifications'
import { canUseRnnoise } from '@/lib/noiseReductionCapabilities'
import { getSocket } from '@/lib/socket'
import { playJoinSound } from '@/lib/sounds'
import {
  buildAudioCaptureOptions,
  buildAudioCaptureOptionsForMode
} from '@/lib/voiceAudioCaptureOptions'
import { getNoiseReductionMode } from '@/lib/voiceProcessingSettings'
import { useVoiceConnectionStore } from '@/stores/voice-connection.store'

function showVoiceError(message: string) {
  const settings = getNotifSettings()
  if (settings.enabled && 'Notification' in window && Notification.permission === 'granted') {
    new Notification('Jablu', { body: message, silent: !settings.soundEnabled })
  }
  window.dispatchEvent(new CustomEvent('voice:error', { detail: { message } }))
}

let _joinPromise: Promise<void> | null = null

export async function joinVoiceChannel(serverId: string, channelId: string, channelName: string) {
  if (_joinPromise) await _joinPromise.catch(() => {})
  _joinPromise = _joinVoiceChannelImpl(serverId, channelId, channelName)
  try {
    await _joinPromise
  } finally {
    _joinPromise = null
  }
}

async function _joinVoiceChannelImpl(serverId: string, channelId: string, channelName: string) {
  const store = useVoiceConnectionStore.getState()

    if (store.currentChannelId) {
      getSocket()?.emit('voice:leave')
      const oldRoom = store.room
      if (oldRoom) {
        void import('@/lib/rnnoiseMicrophone').then(({ stopRnnoiseMicrophone }) => stopRnnoiseMicrophone(oldRoom))
        oldRoom.removeAllListeners()
        oldRoom.localParticipant.getTrackPublications().forEach((pub) => {
          pub.track?.mediaStreamTrack?.stop()
        })
        oldRoom.disconnect().catch(() => {})
      }
    }

  store.setConnecting(serverId, channelId, channelName)

  try {
    const [{ token, url }, devices] = await Promise.all([api.getVoiceToken(channelId), getValidatedDevices()])

    if (useVoiceConnectionStore.getState().currentChannelId !== channelId) {
      useVoiceConnectionStore.getState().disconnect()
      return
    }

    const audioCaptureDefaults = buildAudioCaptureOptions(devices.audioInput || undefined)

    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
      audioCaptureDefaults,
      publishDefaults: {
        audioPreset: { maxBitrate: 128_000 },
        dtx: true,
        red: true
      }
    })

    room.on(RoomEvent.Disconnected, () => {
      const current = useVoiceConnectionStore.getState()
      if (current.room !== room) return
      getSocket()?.emit('voice:leave')
      current.disconnect()
    })

    room.on(RoomEvent.Reconnecting, () => {
      const current = useVoiceConnectionStore.getState()
      if (current.room === room) current.setReconnecting(true)
    })

    room.on(RoomEvent.Reconnected, () => {
      const current = useVoiceConnectionStore.getState()
      if (current.room === room) current.setReconnecting(false)
    })

    await room.connect(url, token)

    if (useVoiceConnectionStore.getState().currentChannelId !== channelId) {
      room.removeAllListeners()
      room.disconnect().catch(() => {})
      useVoiceConnectionStore.getState().disconnect()
      return
    }

    if (devices.audioOutput) {
      room.switchActiveDevice('audiooutput', devices.audioOutput).catch(() => {})
      useVoiceConnectionStore.getState().setAudioOutputDeviceId(devices.audioOutput)
    }

    getSocket()?.emit('voice:join', { channelId })
    store.setConnected(room)
    playJoinSound()

    const mode = getNoiseReductionMode()
    const micOpts = buildAudioCaptureOptions(devices.audioInput || undefined)

    if (mode === 'rnnoise' && canUseRnnoise()) {
      void import('@/lib/rnnoiseMicrophone')
        .then(({ startRnnoiseMicrophone }) => startRnnoiseMicrophone(room, micOpts))
        .catch((err) => {
          console.error('RNNoise microphone failed:', err)
          showVoiceError('RNNoise could not start. Using standard microphone.')
          const fallback = buildAudioCaptureOptionsForMode('standard', devices.audioInput || undefined)
          room.options.audioCaptureDefaults = { ...room.options.audioCaptureDefaults, ...fallback }
          room.localParticipant.setMicrophoneEnabled(true, fallback).catch((e2) => {
            if (e2 instanceof DOMException && e2.name === 'NotAllowedError') {
              showVoiceError('Microphone access denied. Check your browser permissions.')
            } else {
              showVoiceError('Could not access microphone. Check device connections.')
            }
          })
        })
    } else {
      if (mode === 'rnnoise' && !canUseRnnoise()) {
        showVoiceError('RNNoise needs AudioWorklet support. Using standard microphone.')
      }
      room.localParticipant.setMicrophoneEnabled(true, micOpts).catch((err) => {
        if (err instanceof DOMException && err.name === 'NotAllowedError') {
          showVoiceError('Microphone access denied. Check your browser permissions.')
        } else {
          showVoiceError('Could not access microphone. Check device connections.')
        }
      })
    }
  } catch (err) {
    if (useVoiceConnectionStore.getState().currentChannelId !== channelId) return
    console.error('Failed to join voice channel:', err)
    if (err instanceof DOMException && err.name === 'NotAllowedError') {
      showVoiceError('Permission denied. Allow microphone access to join voice channels.')
    } else {
      showVoiceError('Failed to join voice channel. Please try again.')
    }
    store.disconnect()
  }
}
