import { Room, RoomEvent } from "livekit-client";
import { api } from "@/lib/api";
import { getValidatedDevices, getSavedCameraQuality, CAMERA_PRESETS } from "@/lib/deviceSettings";
import { getSocket } from "@/lib/socket";
import { useVoiceConnectionStore } from "@/stores/voice-connection.store";

export async function joinVoiceChannel(channelId: string, channelName: string) {
  const store = useVoiceConnectionStore.getState();

  if (store.currentChannelId) {
    getSocket()?.emit("voice:leave");
    store.disconnect();
  }

  store.setConnecting(channelId, channelName);

  try {
    const [{ token, url }, devices] = await Promise.all([
      api.getVoiceToken(channelId),
      getValidatedDevices(),
    ]);

    const camPreset = CAMERA_PRESETS[getSavedCameraQuality()];
    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
      audioCaptureDefaults: devices.audioInput
        ? { deviceId: { exact: devices.audioInput } }
        : undefined,
      videoCaptureDefaults: {
        ...(devices.camera ? { deviceId: { exact: devices.camera } } : {}),
        resolution: {
          width: camPreset.width,
          height: camPreset.height,
          frameRate: camPreset.fps,
        },
      },
    });

    room.on(RoomEvent.Disconnected, () => {
      getSocket()?.emit("voice:leave");
      useVoiceConnectionStore.getState().disconnect();
    });

    await room.connect(url, token);

    if (devices.audioOutput) {
      room.switchActiveDevice("audiooutput", devices.audioOutput).catch(() => {});
    }

    getSocket()?.emit("voice:join", { channelId });
    store.setConnected(room);

    room.localParticipant.setMicrophoneEnabled(true).catch((err) => {
      console.warn("Could not enable microphone:", err.message);
    });
  } catch (err) {
    console.error("Failed to join voice channel:", err);
    store.disconnect();
  }
}
