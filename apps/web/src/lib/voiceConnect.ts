import { Room, RoomEvent } from 'livekit-client'
import { api } from '@/lib/api'
import { getValidatedDevices } from '@/lib/deviceSettings'
import { getNotifSettings } from '@/lib/notifications'
import { getSocket } from '@/lib/socket'
import { playJoinSound } from '@/lib/sounds'
import { useVoiceConnectionStore } from '@/stores/voice-connection.store'

function showVoiceError(message: string) {
  const settings = getNotifSettings()
  if (settings.enabled && 'Notification' in window && Notification.permission === 'granted') {
    new Notification('Jablu', { body: message, silent: !settings.soundEnabled })
  }
  window.dispatchEvent(new CustomEvent('voice:error', { detail: { message } }))
}

export async function joinVoiceChannel(serverId: string, channelId: string, channelName: string) {
  const store = useVoiceConnectionStore.getState()

  if (store.currentChannelId) {
    getSocket()?.emit('voice:leave')
    const oldRoom = store.room
    if (oldRoom) {
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

    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
      audioCaptureDefaults: {
        noiseSuppression: true,
        echoCancellation: true,
        ...(devices.audioInput ? { deviceId: { exact: devices.audioInput } } : {})
      }
    })

    room.on(RoomEvent.Disconnected, () => {
      const current = useVoiceConnectionStore.getState()
      if (current.room !== room) return
      getSocket()?.emit('voice:leave')
      current.disconnect()
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
    }

    getSocket()?.emit('voice:join', { channelId })
    store.setConnected(room)
    playJoinSound()

    room.localParticipant.setMicrophoneEnabled(true).catch((err) => {
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        showVoiceError('Microphone access denied. Check your browser permissions.')
      } else {
        console.warn('Could not enable microphone:', err.message)
      }
    })
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
