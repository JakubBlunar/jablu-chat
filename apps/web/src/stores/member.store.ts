import type { ServerRole } from "@chat/shared";
import { create } from "zustand";
import { api } from "@/lib/api";

export type Member = {
  userId: string;
  serverId: string;
  role: ServerRole;
  joinedAt: string;
  user: {
    id: string;
    username: string;
    email: string;
    avatarUrl: string | null;
    bio: string | null;
    status?: string;
  };
};

type MemberState = {
  members: Member[];
  onlineUserIds: Set<string>;
  isLoading: boolean;
  fetchMembers: (serverId: string) => Promise<void>;
  initOnlineUsers: (userIds: string[]) => void;
  setUserOnline: (userId: string) => void;
  setUserOffline: (userId: string) => void;
  setUserStatus: (userId: string, status: string) => void;
};

export const useMemberStore = create<MemberState>((set) => ({
  members: [],
  onlineUserIds: new Set(),
  isLoading: false,

  fetchMembers: async (serverId) => {
    set({ isLoading: true });
    try {
      const list = await api.get<Member[]>(`/api/servers/${serverId}/members`);
      set({ members: list, isLoading: false });
    } catch (e) {
      set({ isLoading: false });
      throw e;
    }
  },

  initOnlineUsers: (userIds) =>
    set(() => ({ onlineUserIds: new Set(userIds) })),

  setUserOnline: (userId) =>
    set((s) => {
      const next = new Set(s.onlineUserIds);
      next.add(userId);
      return { onlineUserIds: next };
    }),

  setUserOffline: (userId) =>
    set((s) => {
      const next = new Set(s.onlineUserIds);
      next.delete(userId);
      return { onlineUserIds: next };
    }),

  setUserStatus: (userId, status) =>
    set((s) => ({
      members: s.members.map((m) =>
        m.userId === userId
          ? { ...m, user: { ...m.user, status } }
          : m,
      ),
    })),
}));
