import type {
  ChangeEmailInput,
  ChangePasswordInput,
  UpdateProfileInput,
  User,
  UserStatus,
} from "@chat/shared";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { api } from "../lib/api";
import { unsubscribeFromPush } from "../lib/notifications";

export type AuthUser = User;

type AuthState = {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (
    username: string,
    email: string,
    password: string,
    inviteCode?: string,
  ) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
  checkAuth: () => Promise<void>;
  updateProfile: (data: UpdateProfileInput) => Promise<void>;
  uploadAvatar: (file: File) => Promise<void>;
  deleteAvatar: () => Promise<void>;
  changePassword: (data: ChangePasswordInput) => Promise<void>;
  changeEmail: (data: ChangeEmailInput) => Promise<void>;
  updateStatus: (status: UserStatus) => Promise<void>;
  setUser: (user: AuthUser) => void;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: true,

      login: async (email, password) => {
        const data = await api.login(email, password);
        set({
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          user: { ...data.user, status: data.user.status as UserStatus },
          isAuthenticated: true,
        });
      },

      register: async (username, email, password, inviteCode?) => {
        const data = await api.register(username, email, password, inviteCode);
        set({
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          user: { ...data.user, status: data.user.status as UserStatus },
          isAuthenticated: true,
        });
      },

      logout: async () => {
        const rt = get().refreshToken;
        const at = get().accessToken;
        try {
          if (at) await unsubscribeFromPush(at).catch(() => {});
          if (rt) await api.logout(rt).catch(() => {});
        } finally {
          set({
            user: null,
            accessToken: null,
            refreshToken: null,
            isAuthenticated: false,
          });
        }
      },

      refreshSession: async () => {
        const rt = get().refreshToken;
        if (!rt) return;
        const data = await api.refreshToken(rt);
        set({
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          user: { ...data.user, status: data.user.status as UserStatus },
          isAuthenticated: true,
        });
      },

      updateProfile: async (data) => {
        const user = await api.updateProfile(data);
        set({ user });
        const { useMemberStore } = await import("@/stores/member.store");
        useMemberStore.getState().updateUserProfile(user.id, user);
      },

      uploadAvatar: async (file) => {
        const user = await api.uploadAvatar(file);
        set({ user });
        const { useMemberStore } = await import("@/stores/member.store");
        useMemberStore.getState().updateUserProfile(user.id, user);
      },

      deleteAvatar: async () => {
        const user = await api.deleteAvatar();
        set({ user });
        const { useMemberStore } = await import("@/stores/member.store");
        useMemberStore.getState().updateUserProfile(user.id, user);
      },

      changePassword: async (data) => {
        await api.changePassword(data);
      },

      changeEmail: async (data) => {
        const user = await api.changeEmail(data);
        set({ user });
      },

      updateStatus: async (status) => {
        const user = await api.updateStatus(status);
        set({ user });
      },

      setUser: (user) => set({ user }),

      checkAuth: async () => {
        const { accessToken, refreshToken } = get();
        set({ isLoading: true });

        if (!accessToken || !refreshToken) {
          set({
            user: null,
            isAuthenticated: false,
            isLoading: false,
          });
          return;
        }

        try {
          const user = await api.getProfile();
          set({
            user,
            isAuthenticated: true,
            isLoading: false,
          });
        } catch {
          try {
            const data = await api.refreshToken(refreshToken);
            set({
              accessToken: data.accessToken,
              refreshToken: data.refreshToken,
              user: { ...data.user, status: data.user.status as UserStatus },
              isAuthenticated: true,
              isLoading: false,
            });
          } catch {
            set({
              user: null,
              accessToken: null,
              refreshToken: null,
              isAuthenticated: false,
              isLoading: false,
            });
          }
        }
      },
    }),
    {
      name: "chat-auth",
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
      }),
    },
  ),
);
