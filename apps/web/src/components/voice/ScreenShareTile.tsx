import {
  type Participant,
  type RemoteTrackPublication,
  type TrackPublication,
  Track,
  ParticipantEvent,
  VideoQuality
} from 'livekit-client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useVoiceConnectionStore } from '@/stores/voice-connection.store'

export function ScreenShareTile({
  participant,
  publication,
  focused
}: {
  participant: Participant
  publication: TrackPublication
  focused?: boolean
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [hasTrack, setHasTrack] = useState(false)
  const [hasAudio, setHasAudio] = useState(false)

  useEffect(() => {
    let changeTimer: ReturnType<typeof setTimeout>

    const attach = () => {
      if (publication.track && videoRef.current) {
        publication.track.attach(videoRef.current)
        setHasTrack(true)
      } else {
        setHasTrack(false)
      }
    }

    attach()

    const onChange = () => {
      clearTimeout(changeTimer)
      changeTimer = setTimeout(attach, 50)
    }
    participant.on(ParticipantEvent.TrackSubscribed, onChange)
    participant.on(ParticipantEvent.TrackUnsubscribed, onChange)
    participant.on(ParticipantEvent.LocalTrackPublished, onChange)
    participant.on(ParticipantEvent.LocalTrackUnpublished, onChange)

    return () => {
      clearTimeout(changeTimer)
      if (publication.track && videoRef.current) {
        publication.track.detach(videoRef.current)
      }
      participant.off(ParticipantEvent.TrackSubscribed, onChange)
      participant.off(ParticipantEvent.TrackUnsubscribed, onChange)
      participant.off(ParticipantEvent.LocalTrackPublished, onChange)
      participant.off(ParticipantEvent.LocalTrackUnpublished, onChange)
    }
  }, [participant, publication])

  useEffect(() => {
    if (participant.isLocal) {
      setHasAudio(false)
      return
    }
    let audioTimer: ReturnType<typeof setTimeout>
    const checkAudio = () => {
      const ssAudioPub = participant.getTrackPublication(Track.Source.ScreenShareAudio)
      setHasAudio(!!(ssAudioPub?.track))
    }
    checkAudio()

    const onChange = () => {
      clearTimeout(audioTimer)
      audioTimer = setTimeout(checkAudio, 50)
    }
    participant.on(ParticipantEvent.TrackSubscribed, onChange)
    participant.on(ParticipantEvent.TrackUnsubscribed, onChange)
    return () => {
      clearTimeout(audioTimer)
      participant.off(ParticipantEvent.TrackSubscribed, onChange)
      participant.off(ParticipantEvent.TrackUnsubscribed, onChange)
    }
  }, [participant])

  useEffect(() => {
    if (participant.isLocal || !('setVideoQuality' in publication)) return
    const pub = publication as RemoteTrackPublication
    pub.setVideoQuality(focused ? VideoQuality.HIGH : VideoQuality.LOW)
  }, [participant, publication, focused, hasTrack])

  const displayName = participant.name || participant.identity
  const isLocal = participant.isLocal

  return (
    <div className="group/ss relative flex aspect-video items-center justify-center overflow-hidden rounded-xl bg-black">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={`h-full w-full object-contain ${hasTrack ? '' : 'hidden'}`}
      />

      {!hasTrack && (
        <div className="flex flex-col items-center gap-2 text-gray-400">
          <svg className="h-10 w-10" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20 18c1.1 0 1.99-.9 1.99-2L22 6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2H0v2h24v-2h-4zM4 6h16v10H4V6z" />
          </svg>
          <span className="text-xs">Loading...</span>
        </div>
      )}

      <div className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded bg-black/60 px-2 py-1">
        <svg className="h-3 w-3 text-green-400" viewBox="0 0 24 24" fill="currentColor">
          <path d="M20 18c1.1 0 1.99-.9 1.99-2L22 6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2H0v2h24v-2h-4zM4 6h16v10H4V6z" />
        </svg>
        <span className="text-xs font-medium text-white">{isLocal ? 'Your Screen' : `${displayName}'s Screen`}</span>
      </div>

      {hasAudio && !isLocal && (
        <ScreenAudioControls participantIdentity={participant.identity} />
      )}

      <div className="pointer-events-none absolute inset-0 rounded-xl border-2 border-green-500/30" />
    </div>
  )
}

function ScreenAudioControls({ participantIdentity }: { participantIdentity: string }) {
  const volumeKey = `${participantIdentity}:screenAudio`
  const volume = useVoiceConnectionStore((s) => s.volumeOverrides[volumeKey] ?? 100)
  const setVolumeOverride = useVoiceConnectionStore((s) => s.setVolumeOverride)
  const [showSlider, setShowSlider] = useState(false)
  const [localMuted, setLocalMuted] = useState(false)
  const prevVolume = useRef(volume)

  const handleMuteToggle = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      if (localMuted) {
        setVolumeOverride(volumeKey, prevVolume.current || 100)
        setLocalMuted(false)
      } else {
        prevVolume.current = volume
        setVolumeOverride(volumeKey, 0)
        setLocalMuted(true)
      }
    },
    [localMuted, volume, volumeKey, setVolumeOverride]
  )

  const handleVolumeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      e.stopPropagation()
      const v = Number(e.target.value)
      setVolumeOverride(volumeKey, v)
      if (v > 0) setLocalMuted(false)
    },
    [volumeKey, setVolumeOverride]
  )

  const isMuted = localMuted || volume === 0

  const toggleSlider = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setShowSlider((v) => !v)
  }, [])

  return (
    <div
      className="absolute bottom-2 right-2 flex items-center gap-1 rounded bg-black/60 px-1.5 py-1 opacity-100 transition-opacity md:opacity-0 md:group-hover/ss:opacity-100"
      onMouseEnter={() => setShowSlider(true)}
      onMouseLeave={() => setShowSlider(false)}
      onClick={(e) => e.stopPropagation()}
    >
      {showSlider && (
        <input
          type="range"
          min={0}
          max={200}
          value={isMuted ? 0 : volume}
          onChange={handleVolumeChange}
          onClick={(e) => e.stopPropagation()}
          className="h-2 w-20 cursor-pointer accent-primary"
          title={`${isMuted ? 0 : volume}%`}
        />
      )}
      <button
        type="button"
        onClick={handleMuteToggle}
        className="p-0.5 text-white transition hover:text-gray-300"
        title={isMuted ? 'Unmute screen audio' : 'Mute screen audio'}
      >
        {isMuted ? (
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
          </svg>
        ) : (
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
          </svg>
        )}
      </button>
      {!showSlider && (
        <span className="cursor-pointer text-[10px] tabular-nums text-white/70" onClick={toggleSlider}>
          {isMuted ? 0 : volume}%
        </span>
      )}
    </div>
  )
}
