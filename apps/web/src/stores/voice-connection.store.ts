import { create } from "zustand";
import type { Room } from "livekit-client";
import { getSocket } from "@/lib/socket";
import { type MicMode, getMicMode, startMicMode, stopMicMode, setRoomGetter } from "@/lib/micMode";

function emitVoiceState(state: {
  muted?: boolean;
  deafened?: boolean;
  camera?: boolean;
  screenShare?: boolean;
}) {
  getSocket()?.emit("voice:state", state);
}

export type VoiceConnectionState = {
  currentChannelId: string | null;
  currentChannelName: string | null;
  room: Room | null;
  isMuted: boolean;
  isDeafened: boolean;
  isCameraOn: boolean;
  isScreenSharing: boolean;
  isConnecting: boolean;
  viewingVoiceRoom: boolean;
  micMode: MicMode;

  setConnecting: (channelId: string, channelName: string) => void;
  setConnected: (room: Room) => void;
  disconnect: () => void;
  toggleMute: () => void;
  toggleDeafen: () => void;
  toggleCamera: () => void;
  setScreenSharing: (v: boolean) => void;
  setViewingVoiceRoom: (v: boolean) => void;
  setMicMode: (mode: MicMode) => void;
};

export const useVoiceConnectionStore = create<VoiceConnectionState>(
  (set, get) => ({
    currentChannelId: null,
    currentChannelName: null,
    room: null,
    isMuted: false,
    isDeafened: false,
    isCameraOn: false,
    isScreenSharing: false,
    isConnecting: false,
    viewingVoiceRoom: false,
    micMode: getMicMode(),

    setConnecting: (channelId, channelName) =>
      set({ currentChannelId: channelId, currentChannelName: channelName, isConnecting: true, viewingVoiceRoom: true }),

    setConnected: (room) => {
      set({ room, isConnecting: false });
      const mode = get().micMode;
      if (mode !== "always") {
        setTimeout(() => startMicMode(mode), 500);
      }
    },

    disconnect: () => {
      const { room } = get();
      stopMicMode();
      if (room) {
        room.disconnect().catch(() => {});
      }
      set({
        currentChannelId: null,
        currentChannelName: null,
        room: null,
        isMuted: false,
        isDeafened: false,
        isCameraOn: false,
        isScreenSharing: false,
        isConnecting: false,
        viewingVoiceRoom: false,
      });
    },

    toggleMute: () => {
      const { room, isMuted, micMode } = get();
      const next = !isMuted;
      if (room) {
        room.localParticipant
          .setMicrophoneEnabled(!next)
          .catch(() => {});
      }
      if (next) {
        stopMicMode();
      } else if (micMode !== "always") {
        setTimeout(() => startMicMode(micMode), 300);
      }
      set({ isMuted: next });
      emitVoiceState({ muted: next });
    },

    toggleDeafen: () => {
      const { isDeafened } = get();
      const next = !isDeafened;
      set({ isDeafened: next });
      emitVoiceState({ deafened: next });
    },

    toggleCamera: () => {
      const { room, isCameraOn } = get();
      const next = !isCameraOn;
      if (room) {
        room.localParticipant
          .setCameraEnabled(next)
          .catch(() => {});
      }
      set({ isCameraOn: next });
      emitVoiceState({ camera: next });
    },

    setScreenSharing: (v) => {
      set({ isScreenSharing: v });
      emitVoiceState({ screenShare: v });
    },

    setViewingVoiceRoom: (v) => set({ viewingVoiceRoom: v }),

    setMicMode: (mode) => {
      const { isMuted } = get();
      set({ micMode: mode });
      stopMicMode();
      if (!isMuted && mode !== "always") {
        startMicMode(mode);
      }
    },
  }),
);

setRoomGetter(() => useVoiceConnectionStore.getState().room);
