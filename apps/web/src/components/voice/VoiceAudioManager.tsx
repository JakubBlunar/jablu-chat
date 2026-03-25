import { RoomEvent, Track, type RemoteTrack } from 'livekit-client'
import { useEffect, useRef, useCallback } from 'react'
import { useVoiceConnectionStore } from '@/stores/voice-connection.store'

type AudioNode = {
  source: MediaStreamAudioSourceNode
  gain: GainNode
}

/**
 * Persistent audio manager that keeps remote participants' audio playing
 * even when VoiceRoom is unmounted (e.g. user navigated to DMs or another channel).
 * Uses Web Audio GainNode per track for per-user volume control (0-200%).
 * Rendered in MainLayout so it's always mounted while the app is open.
 */
export function VoiceAudioManager() {
  const room = useVoiceConnectionStore((s) => s.room)
  const isDeafened = useVoiceConnectionStore((s) => s.isDeafened)
  const volumeOverrides = useVoiceConnectionStore((s) => s.volumeOverrides)

  const audioCtxRef = useRef<AudioContext | null>(null)
  const nodesRef = useRef<Map<string, AudioNode>>(new Map())

  const getAudioCtx = useCallback(() => {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new AudioContext()
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume().catch(() => {})
    }
    return audioCtxRef.current
  }, [])

  const attachTrack = useCallback(
    (key: string, track: RemoteTrack) => {
      const existing = nodesRef.current.get(key)
      if (existing) {
        existing.source.disconnect()
        existing.gain.disconnect()
        nodesRef.current.delete(key)
      }

      const ms = track.mediaStream
      if (!ms) return

      const ctx = getAudioCtx()
      const source = ctx.createMediaStreamSource(ms)
      const gain = ctx.createGain()
      source.connect(gain)
      gain.connect(ctx.destination)

      nodesRef.current.set(key, { source, gain })
    },
    [getAudioCtx]
  )

  const detachTrack = useCallback((key: string) => {
    const node = nodesRef.current.get(key)
    if (node) {
      node.source.disconnect()
      node.gain.disconnect()
      nodesRef.current.delete(key)
    }
  }, [])

  const detachAll = useCallback(() => {
    for (const [, node] of nodesRef.current) {
      node.source.disconnect()
      node.gain.disconnect()
    }
    nodesRef.current.clear()
  }, [])

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
          if (!nodesRef.current.has(key)) {
            attachTrack(key, micPub.track as RemoteTrack)
          }
        }

        const ssAudioPub = p.getTrackPublication(Track.Source.ScreenShareAudio)
        if (ssAudioPub?.track) {
          const key = `${p.identity}:screenAudio`
          activeKeys.add(key)
          if (!nodesRef.current.has(key)) {
            attachTrack(key, ssAudioPub.track as RemoteTrack)
          }
        }
      }

      for (const key of nodesRef.current.keys()) {
        if (!activeKeys.has(key)) {
          detachTrack(key)
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
  }, [room, attachTrack, detachTrack, detachAll])

  useEffect(() => {
    for (const [key, node] of nodesRef.current) {
      if (isDeafened) {
        node.gain.gain.value = 0
      } else {
        const vol = volumeOverrides[key] ?? 100
        node.gain.gain.value = vol / 100
      }
    }
  }, [isDeafened, volumeOverrides])

  return null
}
