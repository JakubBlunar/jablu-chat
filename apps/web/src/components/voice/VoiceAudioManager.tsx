import { RoomEvent, Track, type RemoteTrack } from 'livekit-client'
import { useEffect, useRef, useCallback } from 'react'
import { useVoiceConnectionStore } from '@/stores/voice-connection.store'

type AudioEntry = {
  audio: HTMLAudioElement
  gain: GainNode
  source: MediaElementAudioSourceNode
  trackId: string
}

let _audioCtx: AudioContext | null = null

function getAudioCtx(): AudioContext {
  if (!_audioCtx || _audioCtx.state === 'closed') {
    _audioCtx = new AudioContext()
  }
  return _audioCtx
}

/**
 * Persistent audio manager that keeps remote participants' audio playing
 * even when VoiceRoom is unmounted (e.g. user navigated to DMs or another channel).
 * Uses <audio> elements routed through Web Audio GainNode per track for
 * per-user volume control (0-200%).
 * Rendered in MainLayout so it's always mounted while the app is open.
 */
export function VoiceAudioManager() {
  const room = useVoiceConnectionStore((s) => s.room)
  const isDeafened = useVoiceConnectionStore((s) => s.isDeafened)
  const volumeOverrides = useVoiceConnectionStore((s) => s.volumeOverrides)
  const audioOutputDeviceId = useVoiceConnectionStore((s) => s.audioOutputDeviceId)

  const nodesRef = useRef<Map<string, AudioEntry>>(new Map())

  const detachEntry = useCallback((entry: AudioEntry) => {
    entry.gain.disconnect()
    entry.source.disconnect()
    entry.audio.pause()
    entry.audio.srcObject = null
    entry.audio.remove()
  }, [])

  const attachTrack = useCallback(
    (key: string, track: RemoteTrack) => {
      const mst = track.mediaStreamTrack
      if (!mst || mst.readyState !== 'live') return

      const existing = nodesRef.current.get(key)
      if (existing) {
        if (existing.trackId === mst.id) return
        detachEntry(existing)
        nodesRef.current.delete(key)
      }

      const ctx = getAudioCtx()

      const audio = document.createElement('audio')
      audio.srcObject = new MediaStream([mst])
      audio.autoplay = true
      audio.setAttribute('data-voice-key', key)

      const source = ctx.createMediaElementSource(audio)
      const gain = ctx.createGain()
      source.connect(gain)
      gain.connect(ctx.destination)

      const state = useVoiceConnectionStore.getState()
      gain.gain.value = state.isDeafened ? 0 : (state.volumeOverrides[key] ?? 100) / 100

      const outputId = state.audioOutputDeviceId
      if (outputId && 'setSinkId' in audio) {
        ;(audio as any).setSinkId(outputId).catch(() => {})
      }

      document.body.appendChild(audio)
      audio.play().catch(() => {})

      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {})
      }

      nodesRef.current.set(key, { audio, gain, source, trackId: mst.id })
    },
    [detachEntry]
  )

  const detachAll = useCallback(() => {
    for (const [, entry] of nodesRef.current) {
      detachEntry(entry)
    }
    nodesRef.current.clear()
  }, [detachEntry])

  useEffect(() => {
    if (!room) {
      detachAll()
      return
    }

    function rebuild() {
      const activeKeys = new Set<string>()
      for (const p of room!.remoteParticipants.values()) {
        const micPub = p.getTrackPublication(Track.Source.Microphone)
        if (micPub?.track) {
          const key = p.identity
          activeKeys.add(key)
          attachTrack(key, micPub.track as RemoteTrack)
        }

        const ssAudioPub = p.getTrackPublication(Track.Source.ScreenShareAudio)
        if (ssAudioPub?.track) {
          const key = `${p.identity}:screenAudio`
          activeKeys.add(key)
          attachTrack(key, ssAudioPub.track as RemoteTrack)
        }
      }

      for (const key of nodesRef.current.keys()) {
        if (!activeKeys.has(key)) {
          const entry = nodesRef.current.get(key)
          if (entry) detachEntry(entry)
          nodesRef.current.delete(key)
        }
      }
    }

    rebuild()

    room.on(RoomEvent.TrackSubscribed, rebuild)
    room.on(RoomEvent.TrackUnsubscribed, rebuild)
    room.on(RoomEvent.ParticipantConnected, rebuild)
    room.on(RoomEvent.ParticipantDisconnected, rebuild)
    room.on(RoomEvent.Disconnected, rebuild)

    return () => {
      room.off(RoomEvent.TrackSubscribed, rebuild)
      room.off(RoomEvent.TrackUnsubscribed, rebuild)
      room.off(RoomEvent.ParticipantConnected, rebuild)
      room.off(RoomEvent.ParticipantDisconnected, rebuild)
      room.off(RoomEvent.Disconnected, rebuild)
      detachAll()
    }
  }, [room, attachTrack, detachEntry, detachAll])

  useEffect(() => {
    for (const [key, entry] of nodesRef.current) {
      if (isDeafened) {
        entry.gain.gain.value = 0
      } else {
        const vol = volumeOverrides[key] ?? 100
        entry.gain.gain.value = vol / 100
      }
    }
  }, [isDeafened, volumeOverrides])

  useEffect(() => {
    for (const [, entry] of nodesRef.current) {
      if ('setSinkId' in entry.audio) {
        ;(entry.audio as any).setSinkId(audioOutputDeviceId || '').catch(() => {})
      }
    }
    const ctx = _audioCtx
    if (ctx && ctx.state !== 'closed' && 'setSinkId' in ctx) {
      ;(ctx as any).setSinkId(audioOutputDeviceId || '').catch(() => {})
    }
  }, [audioOutputDeviceId])

  useEffect(() => {
    if (!room) return
    const ctx = _audioCtx
    if (!ctx || ctx.state !== 'suspended') return
    const resume = () => ctx.resume().catch(() => {})
    document.addEventListener('click', resume, { once: true })
    document.addEventListener('touchstart', resume, { once: true })
    return () => {
      document.removeEventListener('click', resume)
      document.removeEventListener('touchstart', resume)
    }
  }, [room])

  useEffect(() => {
    if (!room || !navigator.mediaDevices?.addEventListener) return
    const onChange = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices()
        const outputs = devices.filter((d) => d.kind === 'audiooutput')
        const currentId = useVoiceConnectionStore.getState().audioOutputDeviceId
        if (currentId && !outputs.some((d) => d.deviceId === currentId)) {
          useVoiceConnectionStore.getState().setAudioOutputDeviceId('')
          room.switchActiveDevice('audiooutput', '').catch(() => {})
        }
      } catch { /* ignored */ }
    }
    navigator.mediaDevices.addEventListener('devicechange', onChange)
    return () => navigator.mediaDevices.removeEventListener('devicechange', onChange)
  }, [room])

  return null
}
