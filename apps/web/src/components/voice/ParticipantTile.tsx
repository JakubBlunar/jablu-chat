import {
  type Participant,
  type RemoteTrackPublication,
  type TrackPublication,
  Track,
  VideoQuality,
  ParticipantEvent,
} from "livekit-client";
import { useEffect, useRef, useState, useCallback } from "react";
import { useVoiceConnectionStore } from "@/stores/voice-connection.store";

export function ParticipantTile({
  participant,
}: {
  participant: Participant;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [hasVideo, setHasVideo] = useState(false);
  const storeMuted = useVoiceConnectionStore((s) => s.isMuted);

  const checkMicMuted = useCallback((): boolean => {
    if (participant.isLocal) return storeMuted;
    const micPub = participant.getTrackPublication(Track.Source.Microphone);
    return !micPub || !micPub.track;
  }, [participant, storeMuted]);

  const [isMicMuted, setIsMicMuted] = useState(() => checkMicMuted());

  const attachTracks = useCallback(() => {
    const cameraPub = participant.getTrackPublication(Track.Source.Camera);
    const micPub = participant.getTrackPublication(Track.Source.Microphone);

    const hasCamera = !!(cameraPub?.track && !cameraPub.isMuted);
    setHasVideo(hasCamera);

    if (micPub?.track && audioRef.current && !participant.isLocal) {
      micPub.track.attach(audioRef.current);
    }

    setIsMicMuted(checkMicMuted());
  }, [participant, checkMicMuted]);

  // Attach video track to element whenever hasVideo or track changes
  useEffect(() => {
    if (!hasVideo || !videoRef.current) return;
    const cameraPub = participant.getTrackPublication(Track.Source.Camera);
    if (cameraPub?.track) {
      cameraPub.track.attach(videoRef.current);
    }
  }, [hasVideo, participant]);

  useEffect(() => {
    setIsMicMuted(checkMicMuted());
  }, [checkMicMuted]);

  useEffect(() => {
    const onSpeaking = (speaking: boolean) => setIsSpeaking(speaking);
    participant.on(ParticipantEvent.IsSpeakingChanged, onSpeaking);
    return () => {
      participant.off(ParticipantEvent.IsSpeakingChanged, onSpeaking);
    };
  }, [participant]);

  useEffect(() => {
    attachTracks();

    const onTrackChange = () => {
      // Small delay to let LiveKit finish internal state updates
      setTimeout(() => attachTracks(), 50);
    };

    const onTrackMuted = (pub: TrackPublication) => {
      if (pub.source === Track.Source.Camera) {
        setHasVideo(false);
      }
    };

    const onTrackUnmuted = (pub: TrackPublication) => {
      if (pub.source === Track.Source.Camera) {
        setHasVideo(true);
      }
    };

    participant.on(ParticipantEvent.TrackSubscribed, onTrackChange);
    participant.on(ParticipantEvent.TrackUnsubscribed, onTrackChange);
    participant.on(ParticipantEvent.TrackPublished, onTrackChange);
    participant.on(ParticipantEvent.TrackUnpublished, onTrackChange);
    participant.on(ParticipantEvent.LocalTrackPublished, onTrackChange);
    participant.on(ParticipantEvent.LocalTrackUnpublished, onTrackChange);
    participant.on(ParticipantEvent.TrackMuted, onTrackMuted);
    participant.on(ParticipantEvent.TrackUnmuted, onTrackUnmuted);

    return () => {
      participant.off(ParticipantEvent.TrackSubscribed, onTrackChange);
      participant.off(ParticipantEvent.TrackUnsubscribed, onTrackChange);
      participant.off(ParticipantEvent.TrackPublished, onTrackChange);
      participant.off(ParticipantEvent.TrackUnpublished, onTrackChange);
      participant.off(ParticipantEvent.LocalTrackPublished, onTrackChange);
      participant.off(ParticipantEvent.LocalTrackUnpublished, onTrackChange);
      participant.off(ParticipantEvent.TrackMuted, onTrackMuted);
      participant.off(ParticipantEvent.TrackUnmuted, onTrackUnmuted);
    };
  }, [participant, attachTracks]);

  const displayName = participant.name || participant.identity;

  return (
    <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-xl bg-surface-darkest">
      {/* Speaking ring */}
      <div
        className={`pointer-events-none absolute inset-0 rounded-xl border-2 transition-colors duration-200 ${
          isSpeaking ? "border-green-500" : "border-transparent"
        }`}
      />

      {/* Always render video element so it's available for attachment */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={participant.isLocal}
        className={`h-full w-full object-cover ${hasVideo ? "" : "hidden"}`}
      />

      {!hasVideo && (
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary text-3xl font-bold text-white sm:h-24 sm:w-24 sm:text-4xl">
            {displayName.charAt(0).toUpperCase()}
          </div>
          <span className="text-sm font-medium text-gray-300">{displayName}</span>
        </div>
      )}

      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio ref={audioRef} autoPlay />

      {hasVideo && (
        <div className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded bg-black/60 px-2 py-1">
          <span className="text-xs font-medium text-white">{displayName}</span>
          {isMicMuted && <MutedIcon />}
        </div>
      )}

      {!hasVideo && isMicMuted && (
        <div className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded bg-black/60 px-2 py-1">
          <MutedIcon />
        </div>
      )}

      {hasVideo && !participant.isLocal && (
        <QualitySelector participant={participant} />
      )}
    </div>
  );
}

function MutedIcon() {
  return (
    <svg className="h-3.5 w-3.5 text-red-400" viewBox="0 0 24 24" fill="currentColor">
      <path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z" />
    </svg>
  );
}

function QualitySelector({ participant }: { participant: Participant }) {
  const [quality, setQuality] = useState<"auto" | "low" | "medium" | "high">(
    "auto",
  );

  const handleChange = (val: typeof quality) => {
    setQuality(val);
    const cameraPub = participant.getTrackPublication(Track.Source.Camera);
    if (cameraPub && "setVideoQuality" in cameraPub) {
      const pub = cameraPub as RemoteTrackPublication;
      switch (val) {
        case "low":
          pub.setVideoQuality(VideoQuality.LOW);
          break;
        case "medium":
          pub.setVideoQuality(VideoQuality.MEDIUM);
          break;
        case "high":
          pub.setVideoQuality(VideoQuality.HIGH);
          break;
        default:
          pub.setVideoQuality(VideoQuality.HIGH);
          break;
      }
    }
  };

  return (
    <div className="absolute bottom-2 right-2">
      <select
        value={quality}
        onChange={(e) => handleChange(e.target.value as typeof quality)}
        className="rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white outline-none"
      >
        <option value="auto">Auto</option>
        <option value="low">Low</option>
        <option value="medium">Medium</option>
        <option value="high">High</option>
      </select>
    </div>
  );
}
