import type { Server as SharedServer } from "@chat/shared";
import { create } from "zustand";
import { api } from "@/lib/api";

export type Server = SharedServer & { memberCount: number };

type CreateServerResponse = SharedServer & {
  members?: unknown[];
};

export type ViewMode = "server" | "dm";

type ServerState = {
  servers: Server[];
  currentServerId: string | null;
  viewMode: ViewMode;
  isLoading: boolean;
  fetchServers: () => Promise<void>;
  createServer: (name: string) => Promise<Server>;
  setCurrentServer: (id: string | null) => void;
  setViewMode: (mode: ViewMode) => void;
  getCurrentServer: () => Server | null;
  updateServerInList: (id: string, patch: Partial<Server>) => void;
  removeServer: (id: string) => void;
};

export const useServerStore = create<ServerState>((set, get) => ({
  servers: [],
  currentServerId: null,
  viewMode: "server" as ViewMode,
  isLoading: false,

  fetchServers: async () => {
    set({ isLoading: true });
    try {
      const list = await api.get<Server[]>("/api/servers");
      set({ servers: list, isLoading: false });
    } catch (e) {
      set({ isLoading: false });
      throw e;
    }
  },

  createServer: async (name) => {
    const raw = await api.post<CreateServerResponse>("/api/servers", { name });
    const server: Server = {
      id: raw.id,
      name: raw.name,
      iconUrl: raw.iconUrl,
      ownerId: raw.ownerId,
      createdAt: raw.createdAt,
      memberCount: raw.members?.length ?? 1,
    };
    set((s) => ({ servers: [...s.servers, server] }));
    return server;
  },

  setCurrentServer: (id) => set({ currentServerId: id, viewMode: "server" }),

  setViewMode: (mode) => set({ viewMode: mode }),

  getCurrentServer: () => {
    const { servers, currentServerId } = get();
    if (!currentServerId) return null;
    return servers.find((s) => s.id === currentServerId) ?? null;
  },

  updateServerInList: (id, patch) =>
    set((s) => ({
      servers: s.servers.map((srv) =>
        srv.id === id ? { ...srv, ...patch } : srv,
      ),
    })),

  removeServer: (id) =>
    set((s) => ({
      servers: s.servers.filter((srv) => srv.id !== id),
      currentServerId: s.currentServerId === id ? null : s.currentServerId,
    })),
}));
