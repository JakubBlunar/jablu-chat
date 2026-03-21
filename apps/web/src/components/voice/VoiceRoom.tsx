import { RoomEvent, Track, type Participant, type TrackPublication } from "livekit-client";
import { useCallback, useEffect, useRef, useState } from "react";
import { getSocket } from "@/lib/socket";
import { useVoiceConnectionStore } from "@/stores/voice-connection.store";
import { ParticipantTile } from "./ParticipantTile";
import { ScreenShareTile } from "./ScreenShareTile";

type TileEntry =
  | { kind: "participant"; id: string; participant: Participant }
  | { kind: "screen"; id: string; participant: Participant; publication: TrackPublication };

export function VoiceRoom() {
  const room = useVoiceConnectionStore((s) => s.room);
  const channelName = useVoiceConnectionStore((s) => s.currentChannelName);
  const [tiles, setTiles] = useState<TileEntry[]>([]);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [pendingFullscreen, setPendingFullscreen] = useState(false);

  useEffect(() => {
    if (!room) return;

    const update = () => {
      const allParticipants: Participant[] = [
        room.localParticipant,
        ...Array.from(room.remoteParticipants.values()),
      ];

      const newTiles: TileEntry[] = [];

      for (const p of allParticipants) {
        newTiles.push({ kind: "participant", id: p.identity, participant: p });

        const ssPub = p.getTrackPublication(Track.Source.ScreenShare);
        if (ssPub?.track) {
          newTiles.push({
            kind: "screen",
            id: `${p.identity}:screen`,
            participant: p,
            publication: ssPub,
          });
        }
      }

      setTiles(newTiles);
    };

    update();

    room.on(RoomEvent.ParticipantConnected, update);
    room.on(RoomEvent.ParticipantDisconnected, update);
    room.on(RoomEvent.TrackSubscribed, update);
    room.on(RoomEvent.TrackUnsubscribed, update);
    room.on(RoomEvent.TrackPublished, update);
    room.on(RoomEvent.TrackUnpublished, update);
    room.on(RoomEvent.LocalTrackPublished, update);
    room.on(RoomEvent.LocalTrackUnpublished, update);

    return () => {
      room.off(RoomEvent.ParticipantConnected, update);
      room.off(RoomEvent.ParticipantDisconnected, update);
      room.off(RoomEvent.TrackSubscribed, update);
      room.off(RoomEvent.TrackUnsubscribed, update);
      room.off(RoomEvent.TrackPublished, update);
      room.off(RoomEvent.TrackUnpublished, update);
      room.off(RoomEvent.LocalTrackPublished, update);
      room.off(RoomEvent.LocalTrackUnpublished, update);
    };
  }, [room]);

  // Clear focus if the focused tile is gone
  useEffect(() => {
    if (focusedId && !tiles.some((t) => t.id === focusedId)) {
      setFocusedId(null);
    }
  }, [tiles, focusedId]);

  const handleTileClick = useCallback((id: string) => {
    setFocusedId((prev) => (prev === id ? null : id));
    setPendingFullscreen(false);
  }, []);

  const handleTileFullscreen = useCallback((id: string) => {
    setFocusedId(id);
    setPendingFullscreen(true);
  }, []);

  if (!room) {
    return (
      <div className="flex flex-1 items-center justify-center text-gray-400">
        Not connected to a voice channel
      </div>
    );
  }

  const focusedTile = focusedId ? tiles.find((t) => t.id === focusedId) ?? null : null;
  const otherTiles = focusedTile ? tiles.filter((t) => t.id !== focusedId) : tiles;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <VoiceRoomHeader
        channelName={channelName}
        participantCount={tiles.filter((t) => t.kind === "participant").length}
      />

      <div className="flex flex-1 flex-col overflow-hidden p-4">
        {focusedTile ? (
          <FocusedLayout
            focused={focusedTile}
            others={otherTiles}
            onTileClick={handleTileClick}
            onUnfocus={() => setFocusedId(null)}
            autoFullscreen={pendingFullscreen}
            onFullscreenConsumed={() => setPendingFullscreen(false)}
          />
        ) : (
          <div className="flex h-full flex-wrap content-center items-center justify-center gap-3">
            {tiles.map((tile) => (
              <div key={tile.id} className={tileSize(tiles.length)}>
                <ClickableTile
                  tile={tile}
                  onClick={handleTileClick}
                  onFullscreen={handleTileFullscreen}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TileContent({ tile }: { tile: TileEntry }) {
  if (tile.kind === "screen") {
    return <ScreenShareTile participant={tile.participant} publication={tile.publication} />;
  }
  return <ParticipantTile participant={tile.participant} />;
}

function ClickableTile({
  tile,
  onClick,
  onFullscreen,
}: {
  tile: TileEntry;
  onClick: (id: string) => void;
  onFullscreen?: (id: string) => void;
}) {
  return (
    <div className="group/tile relative w-full">
      <button
        type="button"
        className="w-full text-left transition"
        onClick={() => onClick(tile.id)}
      >
        <TileContent tile={tile} />
      </button>
      <div className="absolute right-2 top-2 flex items-center gap-1 opacity-0 transition-opacity group-hover/tile:opacity-100">
        <button
          type="button"
          title="Focus"
          onClick={(e) => {
            e.stopPropagation();
            onClick(tile.id);
          }}
          className="rounded-md bg-black/60 p-1.5 text-white backdrop-blur transition hover:bg-black/80"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
          </svg>
        </button>
        {onFullscreen && (
          <button
            type="button"
            title="Fullscreen"
            onClick={(e) => {
              e.stopPropagation();
              onFullscreen(tile.id);
            }}
            className="rounded-md bg-black/60 p-1.5 text-white backdrop-blur transition hover:bg-black/80"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

function FocusedLayout({
  focused,
  others,
  onTileClick,
  onUnfocus,
  autoFullscreen,
  onFullscreenConsumed,
}: {
  focused: TileEntry;
  others: TileEntry[];
  onTileClick: (id: string) => void;
  onUnfocus: () => void;
  autoFullscreen?: boolean;
  onFullscreenConsumed?: () => void;
}) {
  const fsRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  useEffect(() => {
    if (autoFullscreen && fsRef.current && !document.fullscreenElement) {
      fsRef.current.requestFullscreen().catch(() => {});
      onFullscreenConsumed?.();
    }
  }, [autoFullscreen, onFullscreenConsumed]);

  const toggleFullscreen = useCallback(() => {
    if (!fsRef.current) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      fsRef.current.requestFullscreen().catch(() => {});
    }
  }, []);

  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden">
      <div ref={fsRef} className="relative min-h-0 flex-1 bg-surface-darkest">
        <button
          type="button"
          className="h-full w-full text-left"
          onClick={onUnfocus}
        >
          <div className="h-full [&>div]:aspect-auto [&>div]:h-full [&>div]:w-full">
            <TileContent tile={focused} />
          </div>
        </button>

        <div className="absolute right-3 top-3 flex items-center gap-1.5">
          <button
            type="button"
            onClick={toggleFullscreen}
            className="flex items-center gap-1.5 rounded-lg bg-black/60 px-3 py-1.5 text-xs font-medium text-white backdrop-blur transition hover:bg-black/80"
          >
            {isFullscreen ? (
              <>
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
                </svg>
                Exit Fullscreen
              </>
            ) : (
              <>
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
                </svg>
                Fullscreen
              </>
            )}
          </button>

          {!isFullscreen && (
            <button
              type="button"
              onClick={onUnfocus}
              className="flex items-center gap-1.5 rounded-lg bg-black/60 px-3 py-1.5 text-xs font-medium text-white backdrop-blur transition hover:bg-black/80"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
              </svg>
              Unfocus
            </button>
          )}
        </div>
      </div>

      {others.length > 0 && !isFullscreen && (
        <div className="flex h-28 shrink-0 gap-2 overflow-x-auto pb-1">
          {others.map((t) => (
            <div key={t.id} className="h-full w-44 shrink-0">
              <ClickableTile tile={t} onClick={onTileClick} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function VoiceRoomHeader({
  channelName,
  participantCount,
}: {
  channelName: string | null;
  participantCount: number;
}) {
  const isMuted = useVoiceConnectionStore((s) => s.isMuted);
  const isDeafened = useVoiceConnectionStore((s) => s.isDeafened);
  const toggleMute = useVoiceConnectionStore((s) => s.toggleMute);
  const toggleDeafen = useVoiceConnectionStore((s) => s.toggleDeafen);
  const disconnect = useVoiceConnectionStore((s) => s.disconnect);

  const handleDisconnect = useCallback(() => {
    getSocket()?.emit("voice:leave");
    disconnect();
  }, [disconnect]);

  return (
    <div className="flex h-12 shrink-0 items-center border-b border-black/20 bg-surface px-4 shadow-sm">
      <svg className="mr-2 h-5 w-5 text-gray-400" viewBox="0 0 24 24" fill="currentColor">
        <path d="M3 10v4h4l5 5V5L7 10H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
      </svg>
      <span className="text-[15px] font-semibold text-white">
        {channelName}
      </span>
      <span className="ml-2 text-sm text-gray-400">
        {participantCount} participant{participantCount !== 1 ? "s" : ""}
      </span>

      <div className="ml-auto flex items-center gap-1">
        <button
          type="button"
          title={isMuted ? "Unmute" : "Mute"}
          onClick={toggleMute}
          className={`rounded-md p-1.5 transition ${
            isMuted
              ? "bg-red-500/20 text-red-400"
              : "text-gray-400 hover:bg-white/10 hover:text-white"
          }`}
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
            {isMuted ? (
              <path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z" />
            ) : (
              <path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z" />
            )}
          </svg>
        </button>

        <button
          type="button"
          title={isDeafened ? "Undeafen" : "Deafen"}
          onClick={toggleDeafen}
          className={`rounded-md p-1.5 transition ${
            isDeafened
              ? "bg-red-500/20 text-red-400"
              : "text-gray-400 hover:bg-white/10 hover:text-white"
          }`}
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12v4.5C2 18.43 3.57 20 5.5 20H9V12H4c0-4.42 3.58-8 8-8s8 3.58 8 8h-5v8h3.5c1.93 0 3.5-1.57 3.5-3.5V12c0-5.52-4.48-10-10-10z" />
          </svg>
        </button>

        <button
          type="button"
          title="Disconnect"
          onClick={handleDisconnect}
          className="rounded-md p-1.5 text-red-400 transition hover:bg-red-500/20"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08c-.18-.17-.29-.42-.29-.7 0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.69-1.36-2.67-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function tileSize(count: number): string {
  if (count <= 1) return "w-full max-w-2xl";
  if (count <= 2) return "w-[calc(50%-0.375rem)] max-w-xl";
  if (count <= 4) return "w-[calc(50%-0.375rem)] max-w-lg";
  if (count <= 6) return "w-[calc(33.333%-0.5rem)] max-w-md";
  return "w-[calc(25%-0.5rem)] max-w-sm";
}
