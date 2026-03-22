import { create } from "zustand";

type LayoutState = {
  navDrawerOpen: boolean;
  memberDrawerOpen: boolean;
  memberSidebarVisible: boolean;
  channelSidebarWidth: number;

  openNavDrawer: () => void;
  closeNavDrawer: () => void;
  openMemberDrawer: () => void;
  closeMemberDrawer: () => void;
  toggleMemberSidebar: () => void;
  setMemberSidebarVisible: (v: boolean) => void;
  setChannelSidebarWidth: (w: number) => void;
};

const MEMBER_SIDEBAR_KEY = "jablu-member-sidebar";
const CHANNEL_SIDEBAR_WIDTH_KEY = "jablu-channel-sidebar-width";
const CHANNEL_SIDEBAR_DEFAULT = 256;
const CHANNEL_SIDEBAR_MIN = 200;
const CHANNEL_SIDEBAR_MAX = 320;

function loadChannelSidebarWidth(): number {
  try {
    const v = localStorage.getItem(CHANNEL_SIDEBAR_WIDTH_KEY);
    if (v === null) return CHANNEL_SIDEBAR_DEFAULT;
    const n = Number(v);
    if (Number.isNaN(n)) return CHANNEL_SIDEBAR_DEFAULT;
    return Math.max(CHANNEL_SIDEBAR_MIN, Math.min(CHANNEL_SIDEBAR_MAX, n));
  } catch {
    return CHANNEL_SIDEBAR_DEFAULT;
  }
}

export { CHANNEL_SIDEBAR_MIN, CHANNEL_SIDEBAR_MAX };

function loadMemberSidebar(): boolean {
  try {
    const v = localStorage.getItem(MEMBER_SIDEBAR_KEY);
    return v === null ? true : v === "1";
  } catch {
    return true;
  }
}

export const useLayoutStore = create<LayoutState>((set) => ({
  navDrawerOpen: false,
  memberDrawerOpen: false,
  memberSidebarVisible: loadMemberSidebar(),
  channelSidebarWidth: loadChannelSidebarWidth(),

  openNavDrawer: () => set({ navDrawerOpen: true }),
  closeNavDrawer: () => set({ navDrawerOpen: false }),
  openMemberDrawer: () => set({ memberDrawerOpen: true }),
  closeMemberDrawer: () => set({ memberDrawerOpen: false }),

  toggleMemberSidebar: () =>
    set((s) => {
      const next = !s.memberSidebarVisible;
      try {
        localStorage.setItem(MEMBER_SIDEBAR_KEY, next ? "1" : "0");
      } catch {}
      return { memberSidebarVisible: next };
    }),

  setMemberSidebarVisible: (v) => {
    try {
      localStorage.setItem(MEMBER_SIDEBAR_KEY, v ? "1" : "0");
    } catch {}
    set({ memberSidebarVisible: v });
  },

  setChannelSidebarWidth: (w) => {
    const clamped = Math.max(CHANNEL_SIDEBAR_MIN, Math.min(CHANNEL_SIDEBAR_MAX, Math.round(w)));
    try {
      localStorage.setItem(CHANNEL_SIDEBAR_WIDTH_KEY, String(clamped));
    } catch {}
    set({ channelSidebarWidth: clamped });
  },
}));
