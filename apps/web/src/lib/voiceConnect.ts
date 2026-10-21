import { DisconnectReason, Room, RoomEvent } from 'livekit-client'
import { api } from '@/lib/api'
import { getValidatedDevices } from '@/lib/deviceSettings'
import { getNotifSettings } from '@/lib/notifications'
import { getSocket } from '@/lib/socket'
import { playJoinSound } from '@/lib/sounds'
import { buildAudioCaptureOptions } from '@/lib/voiceAudioCaptureOptions'
import { useSettingsStore } from '@/stores/settings.store'
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
  await joinVoiceSession(serverId, channelId, channelName)
}

export async function joinDmCall(callId: string, conversationId: string, name: string, isValid?: () => boolean) {
  await joinVoiceSession(null, conversationId, name, callId, isValid)
}

async function joinVoiceSession(
  serverId: string | null,
  channelId: string,
  channelName: string,
  dmCallId?: string,
  isValid?: () => boolean
) {
  if (_joinPromise) await _joinPromise.catch(() => {})
  if (isValid && !isValid()) return
  _joinPromise = _joinVoiceChannelImpl(serverId, channelId, channelName, dmCallId, isValid)
  try {
    await _joinPromise
  } finally {
    _joinPromise = null
  }
}

async function _joinVoiceChannelImpl(
  serverId: string | null,
  channelId: string,
  channelName: string,
  dmCallId?: string,
  isValid?: () => boolean
) {
  const store = useVoiceConnectionStore.getState()

  if (store.currentChannelId) {
    getSocket()?.emit('voice:leave')
    await store.disconnect()
  }

  store.setConnecting(serverId, channelId, channelName, dmCallId)
  const isCurrent = () => {
    const current = useVoiceConnectionStore.getState()
    return (
      current.currentChannelId === channelId &&
      current.currentDmCallId === (dmCallId ?? null) &&
      (!isValid || isValid())
    )
  }

  try {
    const [{ token, url }, devices] = await Promise.all([
      dmCallId ? api.getDmVoiceToken(dmCallId) : api.getVoiceToken(channelId),
      getValidatedDevices()
    ])

    if (!isCurrent()) return

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

    room.on(RoomEvent.Disconnected, (reason?: DisconnectReason) => {
      const current = useVoiceConnectionStore.getState()
      if (current.room !== room) return
      getSocket()?.emit('voice:leave')
      if (reason === undefined || reason === DisconnectReason.CLIENT_INITIATED) {
        current.disconnect()
        return
      }
      const serverId = current.currentServerId
      const chId = current.currentChannelId
      const chName = current.currentChannelName
      if (serverId && chId) {
        showVoiceError('Voice connection dropped. You can try reconnecting.')
        current.disconnectAfterUnexpectedClose({
          serverId,
          channelId: chId,
          channelName: chName ?? 'Voice'
        })
      } else {
        current.disconnect()
      }
    })

    const onReconnecting = () => {
      const current = useVoiceConnectionStore.getState()
      if (current.room === room) {
        current.setReconnecting(true)
        window.dispatchEvent(
          new CustomEvent('voice:reconnecting', {
            detail: { message: 'Reconnecting to voice…' }
          })
        )
      }
    }
    room.on(RoomEvent.Reconnecting, onReconnecting)
    room.on(RoomEvent.SignalReconnecting, onReconnecting)

    room.on(RoomEvent.Reconnected, () => {
      const current = useVoiceConnectionStore.getState()
      if (current.room === room) current.setReconnecting(false)
    })

    await room.connect(url, token)

    if (!isCurrent()) {
      room.removeAllListeners()
      room.disconnect().catch(() => {})
      return
    }

    if (devices.audioOutput) {
      room.switchActiveDevice('audiooutput', devices.audioOutput).catch(() => {
        if (useVoiceConnectionStore.getState().room === room) {
          useVoiceConnectionStore.getState().setAudioOutputError(true)
        }
      })
    }
    useVoiceConnectionStore.getState().setAudioOutputDeviceId(devices.audioOutput)

    if (!dmCallId) getSocket()?.emit('voice:join', { channelId })
    const { voiceJoinMuted, voiceJoinDeafened } = useSettingsStore.getState()
    store.setConnected(room, { skipMicModeBootstrap: true, joinMuted: voiceJoinMuted, joinDeafened: voiceJoinDeafened })
    playJoinSound()

    // Receive-only joins do not request, capture or publish a microphone.
    if (!voiceJoinMuted && !voiceJoinDeafened) void store.requestMicrophone(true)
  } catch (err) {
    if (!isCurrent()) return
    console.error('Failed to join voice channel:', err)
    if (err instanceof DOMException && err.name === 'NotAllowedError') {
      showVoiceError('Permission denied. Allow microphone access to join voice channels.')
    } else {
      showVoiceError('Failed to join voice channel. Please try again.')
    }
    store.disconnect()
  }
}
