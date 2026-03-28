import {
  type Participant,
  type RemoteTrackPublication,
  type TrackPublication,
  Track,
  VideoQuality,
  ParticipantEvent
} from 'livekit-client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { useVoiceConnectionStore } from '@/stores/voice-connection.store'
import { useVoiceStore } from '@/stores/voice.store'

export function ParticipantTile({
  participant,
  compact,
  focused
}: {
  participant: Participant
  compact?: boolean
  focused?: boolean
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [hasVideo, setHasVideo] = useState(false)
  const storeMuted = useVoiceConnectionStore((s) => s.isMuted)
  const currentChannelId = useVoiceConnectionStore((s) => s.currentChannelId)
  const remoteExplicitMuted = useVoiceStore((s) => {
    if (participant.isLocal || !currentChannelId) return false
    const list = s.participants[currentChannelId]
    return list?.find((p) => p.userId === participant.identity)?.muted ?? false
  })

  const checkMicMuted = useCallback((): boolean => {
    if (participant.isLocal) return storeMuted
    return remoteExplicitMuted
  }, [participant, storeMuted, remoteExplicitMuted])

  const [isMicMuted, setIsMicMuted] = useState(() => checkMicMuted())

  const updateVideoState = useCallback(() => {
    const cameraPub = participant.getTrackPublication(Track.Source.Camera)
    setHasVideo(!!(cameraPub?.track && !cameraPub.isMuted))
  }, [participant])

  const cameraTrackSid = participant.getTrackPublication(Track.Source.Camera)?.track?.sid

  useEffect(() => {
    if (!hasVideo || !videoRef.current) return
    const cameraPub = participant.getTrackPublication(Track.Source.Camera)
    if (cameraPub?.track) {
      cameraPub.track.attach(videoRef.current)
    }
  }, [hasVideo, participant, cameraTrackSid])

  // Auto-adjust subscription quality based on view context
  useEffect(() => {
    if (participant.isLocal) return
    const cameraPub = participant.getTrackPublication(Track.Source.Camera)
    if (!cameraPub || !('setVideoQuality' in cameraPub)) return
    const pub = cameraPub as RemoteTrackPublication
    if (focused) {
      pub.setVideoQuality(VideoQuality.HIGH)
    } else if (compact) {
      pub.setVideoQuality(VideoQuality.LOW)
    } else {
      pub.setVideoQuality(VideoQuality.MEDIUM)
    }
  }, [participant, compact, focused, hasVideo])

  useEffect(() => {
    setIsMicMuted(checkMicMuted())
  }, [checkMicMuted])

  useEffect(() => {
    const onSpeaking = (speaking: boolean) => setIsSpeaking(speaking)
    participant.on(ParticipantEvent.IsSpeakingChanged, onSpeaking)
    return () => {
      participant.off(ParticipantEvent.IsSpeakingChanged, onSpeaking)
    }
  }, [participant])

  useEffect(() => {
    updateVideoState()
    let trackChangeTimer: ReturnType<typeof setTimeout>

    const onTrackChange = () => {
      clearTimeout(trackChangeTimer)
      trackChangeTimer = setTimeout(() => updateVideoState(), 50)
    }

    const onTrackMuted = (pub: TrackPublication) => {
      if (pub.source === Track.Source.Camera) {
        setHasVideo(false)
      }
    }

    const onTrackUnmuted = (pub: TrackPublication) => {
      if (pub.source === Track.Source.Camera) {
        setHasVideo(true)
      }
    }

    participant.on(ParticipantEvent.TrackSubscribed, onTrackChange)
    participant.on(ParticipantEvent.TrackUnsubscribed, onTrackChange)
    participant.on(ParticipantEvent.TrackPublished, onTrackChange)
    participant.on(ParticipantEvent.TrackUnpublished, onTrackChange)
    participant.on(ParticipantEvent.LocalTrackPublished, onTrackChange)
    participant.on(ParticipantEvent.LocalTrackUnpublished, onTrackChange)
    participant.on(ParticipantEvent.TrackMuted, onTrackMuted)
    participant.on(ParticipantEvent.TrackUnmuted, onTrackUnmuted)

    return () => {
      clearTimeout(trackChangeTimer)
      const cameraPub = participant.getTrackPublication(Track.Source.Camera)
      if (cameraPub?.track && videoRef.current) {
        cameraPub.track.detach(videoRef.current)
      }

      participant.off(ParticipantEvent.TrackSubscribed, onTrackChange)
      participant.off(ParticipantEvent.TrackUnsubscribed, onTrackChange)
      participant.off(ParticipantEvent.TrackPublished, onTrackChange)
      participant.off(ParticipantEvent.TrackUnpublished, onTrackChange)
      participant.off(ParticipantEvent.LocalTrackPublished, onTrackChange)
      participant.off(ParticipantEvent.LocalTrackUnpublished, onTrackChange)
      participant.off(ParticipantEvent.TrackMuted, onTrackMuted)
      participant.off(ParticipantEvent.TrackUnmuted, onTrackUnmuted)
    }
  }, [participant, updateVideoState])

  const displayName = participant.name || participant.identity

  return (
    <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-xl bg-surface-darkest">
      <div
        className={`pointer-events-none absolute inset-0 rounded-xl border-2 transition-colors duration-200 ${
          isSpeaking ? 'border-green-500' : 'border-transparent'
        }`}
      />

      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={participant.isLocal}
        className={`h-full w-full object-contain ${hasVideo ? '' : 'hidden'}`}
      />

      {!hasVideo && (
        <div className="flex flex-col items-center gap-1.5">
          <div
            className={`flex items-center justify-center rounded-full bg-primary font-bold text-white ${
              compact ? 'h-10 w-10 text-lg' : 'h-20 w-20 text-3xl sm:h-24 sm:w-24 sm:text-4xl'
            }`}
          >
            {displayName.charAt(0).toUpperCase()}
          </div>
          {!compact && <span className="text-sm font-medium text-gray-300">{displayName}</span>}
        </div>
      )}

      <div
        className={`absolute flex items-center gap-1 rounded bg-black/60 ${
          compact ? 'bottom-1 left-1 px-1.5 py-0.5' : 'bottom-2 left-2 px-2 py-1'
        }`}
      >
        <span className={`font-medium text-white ${compact ? 'max-w-[80px] truncate text-[10px]' : 'text-xs'}`}>
          {displayName}
        </span>
        {isMicMuted && <MutedIcon />}
      </div>
    </div>
  )
}

function MutedIcon() {
  return (
    <svg className="h-3.5 w-3.5 text-red-400" viewBox="0 0 24 24" fill="currentColor">
      <path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z" />
    </svg>
  )
}
