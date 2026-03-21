import { electronAPI } from "@/lib/electron";
import { useVoiceConnectionStore } from "@/stores/voice-connection.store";
import { getScreenQuality, SCREEN_PRESETS } from "./VoiceSettings";

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

export async function publishScreenShare(sourceId: string) {
  const store = useVoiceConnectionStore.getState();
  const room = store.room;
  if (!room) return;

  const quality = getScreenQuality();
  const preset = SCREEN_PRESETS[quality];

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        // @ts-expect-error Electron's desktopCapturer requires these mandatory constraints
        mandatory: {
          chromeMediaSource: "desktop",
          chromeMediaSourceId: sourceId,
          maxWidth: preset.width,
          maxHeight: preset.height,
          maxFrameRate: preset.fps,
        },
      },
    });

    const track = stream.getVideoTracks()[0];
    if (!track) return;

    await room.localParticipant.publishTrack(track, {
      name: "screen",
      simulcast: false,
      screenShareEncoding: {
        maxBitrate: preset.bitrate,
        maxFramerate: preset.fps,
      },
    });

    track.onended = () => {
      room.localParticipant.unpublishTrack(track);
      useVoiceConnectionStore.getState().setScreenSharing(false);
    };

    store.setScreenSharing(true);
  } catch (err) {
    console.error("Failed to start screen share:", err);
  }
}
