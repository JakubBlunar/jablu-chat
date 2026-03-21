import { useCallback, useEffect, useState } from "react";
import { getSocket } from "@/lib/socket";
import { isElectron } from "@/lib/electron";
import { useVoiceConnectionStore } from "@/stores/voice-connection.store";
import type { MicMode } from "@/lib/micMode";

function MicIcon({ muted }: { muted: boolean }) {
  if (muted) {
    return (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z" />
      </svg>
    );
  }
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z" />
    </svg>
  );
}

function HeadphoneIcon({ deafened }: { deafened: boolean }) {
  if (deafened) {
    return (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C6.48 2 2 6.48 2 12v4.5C2 18.43 3.57 20 5.5 20H9V12H4c0-4.42 3.58-8 8-8s8 3.58 8 8h-5v8h3.5c1.93 0 3.5-1.57 3.5-3.5V12c0-5.52-4.48-10-10-10z" />
        <line x1="3" y1="3" x2="21" y2="21" stroke="currentColor" strokeWidth="2" />
      </svg>
    );
  }
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.48 2 2 6.48 2 12v4.5C2 18.43 3.57 20 5.5 20H9V12H4c0-4.42 3.58-8 8-8s8 3.58 8 8h-5v8h3.5c1.93 0 3.5-1.57 3.5-3.5V12c0-5.52-4.48-10-10-10z" />
    </svg>
  );
}

function CameraIcon({ on }: { on: boolean }) {
  if (!on) {
    return (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M21 6.5l-4 4V7c0-.55-.45-1-1-1H9.82L21 17.18V6.5zM3.27 2L2 3.27 4.73 6H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.21 0 .39-.08.54-.18L19.73 21 21 19.73 3.27 2z" />
      </svg>
    );
  }
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" />
    </svg>
  );
}

function ScreenShareIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20 18c1.1 0 1.99-.9 1.99-2L22 6c0-1.11-.9-2-2-2H4c-1.1 0-2 .89-2 2v10c0 1.1.9 2 2 2H0v2h24v-2h-4zM4 6h16v10H4V6z" />
    </svg>
  );
}

function DisconnectIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08c-.18-.17-.29-.42-.29-.7 0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.69-1.36-2.67-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z" />
    </svg>
  );
}

export function VoicePanel() {
  const channelId = useVoiceConnectionStore((s) => s.currentChannelId);
  const channelName = useVoiceConnectionStore((s) => s.currentChannelName);
  const isMuted = useVoiceConnectionStore((s) => s.isMuted);
  const isDeafened = useVoiceConnectionStore((s) => s.isDeafened);
  const isCameraOn = useVoiceConnectionStore((s) => s.isCameraOn);
  const isScreenSharing = useVoiceConnectionStore((s) => s.isScreenSharing);
  const isConnecting = useVoiceConnectionStore((s) => s.isConnecting);

  const micMode = useVoiceConnectionStore((s) => s.micMode);
  const toggleMute = useVoiceConnectionStore((s) => s.toggleMute);
  const toggleDeafen = useVoiceConnectionStore((s) => s.toggleDeafen);
  const toggleCamera = useVoiceConnectionStore((s) => s.toggleCamera);
  const disconnect = useVoiceConnectionStore((s) => s.disconnect);

  const [elapsed, setElapsed] = useState(0);
  const [connectedAt] = useState(() => Date.now());

  useEffect(() => {
    if (!channelId) return;
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - connectedAt) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [channelId, connectedAt]);

  const handleDisconnect = useCallback(() => {
    getSocket()?.emit("voice:leave");
    disconnect();
  }, [disconnect]);

  const handleScreenShare = useCallback(() => {
    if (!isElectron) return;
    if (isScreenSharing) {
      const room = useVoiceConnectionStore.getState().room;
      room?.localParticipant.setScreenShareEnabled(false).catch(() => {});
      useVoiceConnectionStore.getState().setScreenSharing(false);
    } else {
      import("@/components/voice/screenShareUtils").then(({ startScreenShare }) =>
        startScreenShare(),
      );
    }
  }, [isScreenSharing]);

  if (!channelId) return null;

  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  const timeStr = `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;

  return (
    <div className="border-t border-black/20 bg-surface-overlay px-3 py-2">
      <div className="flex items-center gap-1.5">
        <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-green-500" />
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-green-400">
          {isConnecting ? "Connecting..." : "Voice Connected"}
        </span>
      </div>
      <p className="mt-0.5 truncate text-xs text-gray-400">
        {channelName} &middot; {timeStr}
        {micMode !== "always" && (
          <span className="ml-1 text-[10px] text-gray-500">
            ({micModeLabel(micMode)})
          </span>
        )}
      </p>

      <div className="mt-2 flex items-center justify-center gap-1">
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
          <MicIcon muted={isMuted} />
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
          <HeadphoneIcon deafened={isDeafened} />
        </button>

        {isElectron && (
          <>
            <button
              type="button"
              title={isCameraOn ? "Turn off camera" : "Turn on camera"}
              onClick={toggleCamera}
              className={`rounded-md p-1.5 transition ${
                isCameraOn
                  ? "bg-white/10 text-white"
                  : "text-gray-400 hover:bg-white/10 hover:text-white"
              }`}
            >
              <CameraIcon on={isCameraOn} />
            </button>

            <button
              type="button"
              title={isScreenSharing ? "Stop sharing" : "Share screen"}
              onClick={handleScreenShare}
              className={`rounded-md p-1.5 transition ${
                isScreenSharing
                  ? "bg-primary/20 text-primary"
                  : "text-gray-400 hover:bg-white/10 hover:text-white"
              }`}
            >
              <ScreenShareIcon />
            </button>
          </>
        )}

        <button
          type="button"
          title="Disconnect"
          onClick={handleDisconnect}
          className="rounded-md p-1.5 text-red-400 transition hover:bg-red-500/20"
        >
          <DisconnectIcon />
        </button>
      </div>
    </div>
  );
}

function micModeLabel(mode: MicMode): string {
  switch (mode) {
    case "activity":
      return "VAD";
    case "push-to-talk":
      return "PTT";
    default:
      return "";
  }
}
