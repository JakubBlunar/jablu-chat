import { create } from "zustand";
import { api } from "@/lib/api";

type ChannelUnread = {
  unreadCount: number;
  mentionCount: number;
  lastReadAt: string;
};

type ReadStateState = {
  channels: Map<string, ChannelUnread>;
  dms: Map<string, ChannelUnread>;
  fetchAll: () => Promise<void>;
  ackChannel: (channelId: string) => void;
  ackDm: (conversationId: string) => void;
  incrementChannel: (channelId: string, isMention: boolean) => void;
  incrementDm: (conversationId: string) => void;
  getTotalUnreadForServer: (channelIds: string[]) => { unread: boolean; mentions: number };
};

export const useReadStateStore = create<ReadStateState>()((set, get) => ({
  channels: new Map(),
  dms: new Map(),

  fetchAll: async () => {
    try {
      const data = await api.getReadStates();
      const channels = new Map<string, ChannelUnread>();
      const dms = new Map<string, ChannelUnread>();
      for (const rs of data.channels) {
        channels.set(rs.channelId, {
          unreadCount: 0,
          mentionCount: rs.mentionCount,
          lastReadAt: rs.lastReadAt,
        });
      }
      for (const rs of data.dms) {
        dms.set(rs.conversationId, {
          unreadCount: 0,
          mentionCount: rs.mentionCount,
          lastReadAt: rs.lastReadAt,
        });
      }
      set({ channels, dms });
    } catch {
      // ignore
    }
  },

  ackChannel: (channelId) => {
    const channels = new Map(get().channels);
    channels.set(channelId, {
      unreadCount: 0,
      mentionCount: 0,
      lastReadAt: new Date().toISOString(),
    });
    set({ channels });
    api.ackChannel(channelId).catch(() => {});
  },

  ackDm: (conversationId) => {
    const dms = new Map(get().dms);
    dms.set(conversationId, {
      unreadCount: 0,
      mentionCount: 0,
      lastReadAt: new Date().toISOString(),
    });
    set({ dms });
    api.ackDm(conversationId).catch(() => {});
  },

  incrementChannel: (channelId, isMention) => {
    const channels = new Map(get().channels);
    const current = channels.get(channelId) ?? {
      unreadCount: 0,
      mentionCount: 0,
      lastReadAt: new Date(0).toISOString(),
    };
    channels.set(channelId, {
      ...current,
      unreadCount: current.unreadCount + 1,
      mentionCount: isMention
        ? current.mentionCount + 1
        : current.mentionCount,
    });
    set({ channels });
  },

  incrementDm: (conversationId) => {
    const dms = new Map(get().dms);
    const current = dms.get(conversationId) ?? {
      unreadCount: 0,
      mentionCount: 0,
      lastReadAt: new Date(0).toISOString(),
    };
    dms.set(conversationId, {
      ...current,
      unreadCount: current.unreadCount + 1,
      mentionCount: current.mentionCount + 1,
    });
    set({ dms });
  },

  getTotalUnreadForServer: (channelIds) => {
    const channels = get().channels;
    let mentions = 0;
    let unread = false;
    for (const id of channelIds) {
      const rs = channels.get(id);
      if (rs) {
        if (rs.unreadCount > 0) unread = true;
        mentions += rs.mentionCount;
      }
    }
    return { unread, mentions };
  },
}));
