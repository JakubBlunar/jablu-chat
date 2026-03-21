import { create } from "zustand";

export type VoiceParticipant = {
  userId: string;
  username: string;
};

type VoiceState = {
  /** channelId -> participants */
  participants: Record<string, VoiceParticipant[]>;

  setAll: (state: Record<string, VoiceParticipant[]>) => void;
  addParticipant: (channelId: string, participant: VoiceParticipant) => void;
  removeParticipant: (channelId: string, userId: string) => void;
  reset: () => void;
};

export const useVoiceStore = create<VoiceState>((set) => ({
  participants: {},

  setAll: (state) => set({ participants: state }),

  addParticipant: (channelId, participant) =>
    set((s) => {
      const list = s.participants[channelId] ?? [];
      if (list.some((p) => p.userId === participant.userId)) return s;
      return {
        participants: {
          ...s.participants,
          [channelId]: [...list, participant],
        },
      };
    }),

  removeParticipant: (channelId, userId) =>
    set((s) => {
      const list = s.participants[channelId];
      if (!list) return s;
      const filtered = list.filter((p) => p.userId !== userId);
      const next = { ...s.participants };
      if (filtered.length === 0) {
        delete next[channelId];
      } else {
        next[channelId] = filtered;
      }
      return { participants: next };
    }),

  reset: () => set({ participants: {} }),
}));
