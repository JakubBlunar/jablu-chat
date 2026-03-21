import { create } from "zustand";
import type { Room } from "livekit-client";

export type VoiceConnectionState = {
  currentChannelId: string | null;
  currentChannelName: string | null;
  room: Room | null;
  isMuted: boolean;
  isDeafened: boolean;
  isCameraOn: boolean;
  isScreenSharing: boolean;
  isConnecting: boolean;

  setConnecting: (channelId: string, channelName: string) => void;
  setConnected: (room: Room) => void;
  disconnect: () => void;
  toggleMute: () => void;
  toggleDeafen: () => void;
  toggleCamera: () => void;
  setScreenSharing: (v: boolean) => void;
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

    setConnecting: (channelId, channelName) =>
      set({ currentChannelId: channelId, currentChannelName: channelName, isConnecting: true }),

    setConnected: (room) => set({ room, isConnecting: false }),

    disconnect: () => {
      const { room } = get();
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
      });
    },

    toggleMute: () => {
      const { room, isMuted } = get();
      const next = !isMuted;
      if (room) {
        room.localParticipant
          .setMicrophoneEnabled(!next)
          .catch(() => {});
      }
      set({ isMuted: next });
    },

    toggleDeafen: () => {
      const { isDeafened } = get();
      set({ isDeafened: !isDeafened });
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
    },

    setScreenSharing: (v) => set({ isScreenSharing: v }),
  }),
);
