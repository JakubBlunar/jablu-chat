import { RoomEvent, Track, type Participant, type TrackPublication } from "livekit-client";
import { useEffect, useRef, useState } from "react";
import { useVoiceConnectionStore } from "@/stores/voice-connection.store";
import { ParticipantTile } from "./ParticipantTile";

export function VoiceRoom() {
  const room = useVoiceConnectionStore((s) => s.room);
  const channelName = useVoiceConnectionStore((s) => s.currentChannelName);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [screenShareTrack, setScreenShareTrack] = useState<TrackPublication | null>(null);

  useEffect(() => {
    if (!room) return;

    const update = () => {
      setParticipants([
        room.localParticipant,
        ...Array.from(room.remoteParticipants.values()),
      ]);

      let ssTrack: TrackPublication | null = null;
      for (const p of room.remoteParticipants.values()) {
        const pub = p.getTrackPublication(Track.Source.ScreenShare);
        if (pub?.track) {
          ssTrack = pub;
          break;
        }
      }
      if (!ssTrack) {
        const localSS = room.localParticipant.getTrackPublication(Track.Source.ScreenShare);
        if (localSS?.track) ssTrack = localSS;
      }
      setScreenShareTrack(ssTrack);
    };

    update();

    room.on(RoomEvent.ParticipantConnected, update);
    room.on(RoomEvent.ParticipantDisconnected, update);
    room.on(RoomEvent.TrackSubscribed, update);
    room.on(RoomEvent.TrackUnsubscribed, update);
    room.on(RoomEvent.TrackPublished, update);
    room.on(RoomEvent.TrackUnpublished, update);

    return () => {
      room.off(RoomEvent.ParticipantConnected, update);
      room.off(RoomEvent.ParticipantDisconnected, update);
      room.off(RoomEvent.TrackSubscribed, update);
      room.off(RoomEvent.TrackUnsubscribed, update);
      room.off(RoomEvent.TrackPublished, update);
      room.off(RoomEvent.TrackUnpublished, update);
    };
  }, [room]);

  if (!room) {
    return (
      <div className="flex flex-1 items-center justify-center text-gray-400">
        Not connected to a voice channel
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex h-12 shrink-0 items-center border-b border-black/20 bg-[#313338] px-4 shadow-sm">
        <svg className="mr-2 h-5 w-5 text-gray-400" viewBox="0 0 24 24" fill="currentColor">
          <path d="M3 10v4h4l5 5V5L7 10H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
        </svg>
        <span className="text-[15px] font-semibold text-white">
          {channelName}
        </span>
        <span className="ml-2 text-sm text-gray-400">
          {participants.length} participant{participants.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {screenShareTrack ? (
          <div className="flex h-full gap-3">
            <div className="flex-1">
              <ScreenShareView track={screenShareTrack} />
            </div>
            <div className="flex w-48 flex-col gap-2 overflow-y-auto">
              {participants.map((p) => (
                <ParticipantTile key={p.identity} participant={p} />
              ))}
            </div>
          </div>
        ) : (
          <div className={`grid gap-3 ${gridClass(participants.length)}`}>
            {participants.map((p) => (
              <ParticipantTile key={p.identity} participant={p} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ScreenShareView({ track }: { track: TrackPublication }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (track.track && videoRef.current) {
      track.track.attach(videoRef.current);
    }
    return () => {
      if (track.track && videoRef.current) {
        track.track.detach(videoRef.current);
      }
    };
  }, [track]);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl bg-black">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className="h-full w-full object-contain"
      />
      <div className="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-1 text-xs text-white">
        Screen Share
      </div>
    </div>
  );
}

function gridClass(count: number): string {
  if (count <= 1) return "grid-cols-1 max-w-lg mx-auto";
  if (count <= 4) return "grid-cols-2";
  if (count <= 9) return "grid-cols-3";
  return "grid-cols-4";
}
