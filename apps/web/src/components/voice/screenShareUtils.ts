import { electronAPI } from "@/lib/electron";
import { useVoiceConnectionStore } from "@/stores/voice-connection.store";

export type ScreenShareOptions = {
  resolution: "720p" | "1080p" | "native";
  fps: 5 | 15 | 20 | 30;
};

const RESOLUTION_MAP = {
  "720p": { width: 1280, height: 720 },
  "1080p": { width: 1920, height: 1080 },
  native: { width: 0, height: 0 },
};

const BITRATE_MAP: Record<string, Record<number, number>> = {
  "720p": { 5: 800_000, 15: 1_500_000, 20: 2_000_000, 30: 3_000_000 },
  "1080p": { 5: 1_500_000, 15: 2_500_000, 20: 3_500_000, 30: 5_000_000 },
  native: { 5: 2_000_000, 15: 3_000_000, 20: 4_000_000, 30: 6_000_000 },
};

export async function startScreenShare() {
  const store = useVoiceConnectionStore.getState();
  const room = store.room;
  if (!room || !electronAPI) return;

  try {
    const sources = await electronAPI.getSources();
    if (sources.length === 0) return;

    window.dispatchEvent(
      new CustomEvent("voice:pick-screen", { detail: { sources } }),
    );
  } catch (err) {
    console.error("Failed to get screen sources:", err);
  }
}

export async function publishScreenShare(
  sourceId: string,
  options: ScreenShareOptions,
) {
  const store = useVoiceConnectionStore.getState();
  const room = store.room;
  if (!room) return;

  const res = RESOLUTION_MAP[options.resolution];
  const bitrate = BITRATE_MAP[options.resolution]?.[options.fps] ?? 3_000_000;

  const mandatory: Record<string, unknown> = {
    chromeMediaSource: "desktop",
    chromeMediaSourceId: sourceId,
    maxFrameRate: options.fps,
  };

  if (options.resolution !== "native") {
    mandatory.maxWidth = res.width;
    mandatory.maxHeight = res.height;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        // @ts-expect-error Electron's desktopCapturer requires these mandatory constraints
        mandatory,
      },
    });

    const videoTrack = stream.getVideoTracks()[0];
    if (!videoTrack) return;

    const pub = await room.localParticipant.publishTrack(videoTrack, {
      name: "screen",
      source: "screen_share" as unknown as undefined,
      simulcast: false,
      videoEncoding: {
        maxBitrate: bitrate,
        maxFramerate: options.fps,
      },
      degradationPreference: "maintain-resolution",
    });

    videoTrack.onended = () => {
      if (pub.track) {
        room.localParticipant.unpublishTrack(pub.track);
      }
      useVoiceConnectionStore.getState().setScreenSharing(false);
    };

    store.setScreenSharing(true);
  } catch (err) {
    console.error("Failed to start screen share:", err);
  }
}
