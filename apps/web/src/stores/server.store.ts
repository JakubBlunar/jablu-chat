import type { Server as SharedServer } from "@chat/shared";
import { create } from "zustand";
import { api } from "@/lib/api";

export type Server = SharedServer & { memberCount: number };

type CreateServerResponse = SharedServer & {
  members?: unknown[];
};

export type ViewMode = "server" | "dm";

const NAV_KEY = "jablu:nav";

function loadNav(): { serverId?: string; viewMode?: ViewMode } {
  try {
    const raw = localStorage.getItem(NAV_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveNav(patch: Record<string, unknown>) {
  try {
    const cur = loadNav();
    localStorage.setItem(NAV_KEY, JSON.stringify({ ...cur, ...patch }));
  } catch { /* ignore */ }
}

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

const saved = loadNav();

export const useServerStore = create<ServerState>((set, get) => ({
  servers: [],
  currentServerId: saved.serverId ?? null,
  viewMode: saved.viewMode ?? "server",
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

  setCurrentServer: (id) => {
    set({ currentServerId: id, viewMode: "server" });
    saveNav({ serverId: id, viewMode: "server" });
  },

  setViewMode: (mode) => {
    set({ viewMode: mode });
    saveNav({ viewMode: mode });
  },

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
