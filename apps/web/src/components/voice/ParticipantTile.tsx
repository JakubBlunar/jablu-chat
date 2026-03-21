import {
  type Participant,
  type RemoteTrackPublication,
  Track,
  VideoQuality,
} from "livekit-client";
import { useEffect, useRef, useState } from "react";

function SpeakingRing({ isSpeaking }: { isSpeaking: boolean }) {
  return (
    <div
      className={`pointer-events-none absolute inset-0 rounded-xl border-2 transition-colors duration-200 ${
        isSpeaking ? "border-green-500" : "border-transparent"
      }`}
    />
  );
}

export function ParticipantTile({
  participant,
}: {
  participant: Participant;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [hasVideo, setHasVideo] = useState(false);

  useEffect(() => {
    const onSpeaking = () => setIsSpeaking(true);
    const onStopped = () => setIsSpeaking(false);
    participant.on("isSpeakingChanged", (speaking: boolean) => {
      if (speaking) onSpeaking();
      else onStopped();
    });

    return () => {
      participant.removeAllListeners("isSpeakingChanged");
    };
  }, [participant]);

  useEffect(() => {
    const cameraPub = participant.getTrackPublication(Track.Source.Camera);
    const micPub = participant.getTrackPublication(Track.Source.Microphone);

    if (cameraPub?.track && videoRef.current) {
      cameraPub.track.attach(videoRef.current);
      setHasVideo(true);
    } else {
      setHasVideo(false);
    }

    if (micPub?.track && audioRef.current && !participant.isLocal) {
      micPub.track.attach(audioRef.current);
    }

    const onTrackSubscribed = () => {
      const cam = participant.getTrackPublication(Track.Source.Camera);
      if (cam?.track && videoRef.current) {
        cam.track.attach(videoRef.current);
        setHasVideo(true);
      }
      const mic = participant.getTrackPublication(Track.Source.Microphone);
      if (mic?.track && audioRef.current && !participant.isLocal) {
        mic.track.attach(audioRef.current);
      }
    };

    const onTrackUnsubscribed = () => {
      const cam = participant.getTrackPublication(Track.Source.Camera);
      setHasVideo(!!cam?.track);
    };

    participant.on("trackSubscribed", onTrackSubscribed);
    participant.on("trackUnsubscribed", onTrackUnsubscribed);
    participant.on("trackPublished", onTrackSubscribed);
    participant.on("trackUnpublished", onTrackUnsubscribed);

    return () => {
      participant.off("trackSubscribed", onTrackSubscribed);
      participant.off("trackUnsubscribed", onTrackUnsubscribed);
      participant.off("trackPublished", onTrackSubscribed);
      participant.off("trackUnpublished", onTrackUnsubscribed);
    };
  }, [participant]);

  const displayName = participant.name || participant.identity;
  const isMuted =
    !participant.getTrackPublication(Track.Source.Microphone)?.isMuted === false;

  return (
    <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-xl bg-[#1e1f22]">
      <SpeakingRing isSpeaking={isSpeaking} />

      {hasVideo ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={participant.isLocal}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex flex-col items-center gap-2">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#5865f2] text-2xl font-bold text-white">
            {displayName.charAt(0).toUpperCase()}
          </div>
        </div>
      )}

      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio ref={audioRef} autoPlay />

      <div className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded bg-black/60 px-2 py-1">
        <span className="text-xs font-medium text-white">{displayName}</span>
        {isMuted && (
          <svg className="h-3.5 w-3.5 text-red-400" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z" />
          </svg>
        )}
      </div>

      {hasVideo && !participant.isLocal && (
        <QualitySelector participant={participant} />
      )}
    </div>
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
