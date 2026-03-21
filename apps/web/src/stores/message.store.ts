import type { LinkPreview, Message } from "@chat/shared";
import { create } from "zustand";
import { api } from "@/lib/api";

type TypingEntry = {
  username: string;
  timeout: ReturnType<typeof setTimeout>;
};

type MessagesPage = {
  messages: Message[];
  hasMore: boolean;
};

type ReplyTarget = {
  id: string;
  content: string | null;
  authorName: string;
} | null;

type MessageState = {
  messages: Message[];
  isLoading: boolean;
  hasMore: boolean;
  typingUsers: Map<string, TypingEntry>;
  replyTarget: ReplyTarget;
  fetchMessages: (channelId: string, cursor?: string) => Promise<void>;
  addMessage: (message: Message) => void;
  updateMessage: (message: Message) => void;
  removeMessage: (messageId: string) => void;
  clearMessages: () => void;
  addReaction: (messageId: string, emoji: string, userId: string) => void;
  removeReaction: (messageId: string, emoji: string, userId: string) => void;
  setReplyTarget: (target: ReplyTarget) => void;
  setLinkPreviews: (messageId: string, linkPreviews: LinkPreview[]) => void;
  setTypingUser: (
    channelId: string,
    userId: string,
    username: string,
  ) => void;
  removeTypingUser: (userId: string) => void;
};

function toChronological(messagesDesc: Message[]): Message[] {
  return messagesDesc.slice().reverse();
}

export const useMessageStore = create<MessageState>((set, get) => ({
  messages: [],
  isLoading: false,
  hasMore: false,
  typingUsers: new Map(),
  replyTarget: null,

  fetchMessages: async (channelId, cursor) => {
    set({ isLoading: true });
    try {
      const params = new URLSearchParams();
      if (cursor) params.set("cursor", cursor);
      params.set("limit", "50");
      const qs = params.toString();
      const path = `/api/channels/${channelId}/messages${qs ? `?${qs}` : ""}`;
      const page = await api.get<MessagesPage>(path);
      const chronological = toChronological(page.messages);

      if (cursor) {
        set((s) => ({
          messages: [...chronological, ...s.messages],
          hasMore: page.hasMore,
          isLoading: false,
        }));
      } else {
        set({
          messages: chronological,
          hasMore: page.hasMore,
          isLoading: false,
        });
      }
    } catch (e) {
      set({ isLoading: false });
      throw e;
    }
  },

  addMessage: (message) => {
    set((s) => {
      if (s.messages.some((m) => m.id === message.id)) {
        return s;
      }
      return { messages: [...s.messages, message] };
    });
  },

  updateMessage: (message) => {
    set((s) => ({
      messages: s.messages.map((m) => (m.id === message.id ? message : m)),
    }));
  },

  removeMessage: (messageId) => {
    set((s) => ({
      messages: s.messages.filter((m) => m.id !== messageId),
    }));
  },

  clearMessages: () => {
    const { typingUsers } = get();
    for (const entry of typingUsers.values()) {
      clearTimeout(entry.timeout);
    }
    set({
      messages: [],
      hasMore: false,
      typingUsers: new Map(),
      replyTarget: null,
    });
  },

  addReaction: (messageId, emoji, userId) => {
    set((s) => ({
      messages: s.messages.map((m) => {
        if (m.id !== messageId) return m;
        const reactions = [...(m.reactions ?? [])];
        const existing = reactions.find((r) => r.emoji === emoji);
        if (existing) {
          if (!existing.userIds.includes(userId)) {
            return {
              ...m,
              reactions: reactions.map((r) =>
                r.emoji === emoji
                  ? { ...r, count: r.count + 1, userIds: [...r.userIds, userId] }
                  : r,
              ),
            };
          }
          return m;
        }
        return {
          ...m,
          reactions: [
            ...reactions,
            { emoji, count: 1, userIds: [userId], isCustom: false },
          ],
        };
      }),
    }));
  },

  removeReaction: (messageId, emoji, userId) => {
    set((s) => ({
      messages: s.messages.map((m) => {
        if (m.id !== messageId) return m;
        const reactions = (m.reactions ?? [])
          .map((r) => {
            if (r.emoji !== emoji) return r;
            const uids = r.userIds.filter((id) => id !== userId);
            return { ...r, count: uids.length, userIds: uids };
          })
          .filter((r) => r.count > 0);
        return { ...m, reactions };
      }),
    }));
  },

  setReplyTarget: (target) => set({ replyTarget: target }),

  setLinkPreviews: (messageId, linkPreviews) => {
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === messageId ? { ...m, linkPreviews } : m,
      ),
    }));
  },

  setTypingUser: (_channelId, userId, username) => {
    set((s) => {
      const next = new Map(s.typingUsers);
      const existing = next.get(userId);
      if (existing) clearTimeout(existing.timeout);
      const timeout = setTimeout(() => {
        get().removeTypingUser(userId);
      }, 3000);
      next.set(userId, { username, timeout });
      return { typingUsers: next };
    });
  },

  removeTypingUser: (userId) => {
    set((s) => {
      const next = new Map(s.typingUsers);
      const entry = next.get(userId);
      if (entry) clearTimeout(entry.timeout);
      next.delete(userId);
      return { typingUsers: next };
    });
  },
}));
