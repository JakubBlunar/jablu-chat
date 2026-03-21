import { Room, RoomEvent } from "livekit-client";
import { api } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import { useVoiceConnectionStore } from "@/stores/voice-connection.store";
import { getCameraQuality, CAMERA_PRESETS } from "@/components/voice/VoiceSettings";

export async function joinVoiceChannel(channelId: string, channelName: string) {
  const store = useVoiceConnectionStore.getState();

  if (store.currentChannelId) {
    getSocket()?.emit("voice:leave");
    store.disconnect();
  }

  store.setConnecting(channelId, channelName);

  try {
    const { token, url } = await api.getVoiceToken(channelId);

    const camPreset = CAMERA_PRESETS[getCameraQuality()];
    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
      videoCaptureDefaults: {
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

    await room.localParticipant.setMicrophoneEnabled(true);

    getSocket()?.emit("voice:join", { channelId });
    store.setConnected(room);
  } catch (err) {
    console.error("Failed to join voice channel:", err);
    store.disconnect();
  }
}
