import { type Participant, type TrackPublication, ParticipantEvent } from "livekit-client";
import { useEffect, useRef, useState } from "react";

export function ScreenShareTile({
  participant,
  publication,
}: {
  participant: Participant;
  publication: TrackPublication;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hasTrack, setHasTrack] = useState(false);

  useEffect(() => {
    const attach = () => {
      if (publication.track && videoRef.current) {
        publication.track.attach(videoRef.current);
        setHasTrack(true);
      } else {
        setHasTrack(false);
      }
    };

    attach();

    const onChange = () => setTimeout(attach, 50);
    participant.on(ParticipantEvent.TrackSubscribed, onChange);
    participant.on(ParticipantEvent.TrackUnsubscribed, onChange);
    participant.on(ParticipantEvent.LocalTrackPublished, onChange);
    participant.on(ParticipantEvent.LocalTrackUnpublished, onChange);

    return () => {
      if (publication.track && videoRef.current) {
        publication.track.detach(videoRef.current);
      }
      participant.off(ParticipantEvent.TrackSubscribed, onChange);
      participant.off(ParticipantEvent.TrackUnsubscribed, onChange);
      participant.off(ParticipantEvent.LocalTrackPublished, onChange);
      participant.off(ParticipantEvent.LocalTrackUnpublished, onChange);
    };
  }, [participant, publication]);

  const displayName = participant.name || participant.identity;
  const isLocal = participant.isLocal;

  return (
    <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-xl bg-black">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={`h-full w-full object-contain ${hasTrack ? "" : "hidden"}`}
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
        <span className="text-xs font-medium text-white">
          {isLocal ? "Your Screen" : `${displayName}'s Screen`}
        </span>
      </div>

      {/* Green border to distinguish screen share tiles */}
      <div className="pointer-events-none absolute inset-0 rounded-xl border-2 border-green-500/30" />
    </div>
  );
}
