import { create } from "zustand";
import { api } from "@/lib/api";

type NotifLevel = "all" | "mentions" | "none";

type NotifPrefState = {
  prefs: Record<string, NotifLevel>;
  fetchAll: () => Promise<void>;
  set: (channelId: string, level: NotifLevel) => void;
  remove: (channelId: string) => void;
  get: (channelId: string) => NotifLevel;
};

export const useNotifPrefStore = create<NotifPrefState>()((set, get) => ({
  prefs: {},

  fetchAll: async () => {
    try {
      const data = await api.getAllNotifPrefs();
      set({ prefs: data.prefs as Record<string, NotifLevel> });
    } catch {
      /* ignore – prefs default to "all" */
    }
  },

  set: (channelId, level) => {
    set((state) => ({ prefs: { ...state.prefs, [channelId]: level } }));
  },

  remove: (channelId) => {
    set((state) => {
      const next = { ...state.prefs };
      delete next[channelId];
      return { prefs: next };
    });
  },

  get: (channelId) => get().prefs[channelId] ?? "all",
}));
