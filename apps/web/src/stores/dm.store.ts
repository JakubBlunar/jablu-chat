import type { Message } from "@chat/shared";
import { create } from "zustand";
import { api, type DmConversation } from "@/lib/api";


type DmState = {
  conversations: DmConversation[];
  currentConversationId: string | null;
  messages: Message[];
  hasMore: boolean;
  hasNewer: boolean;
  isLoading: boolean;
  isConversationsLoading: boolean;
  loadedForConvId: string | null;
  scrollToMessageId: string | null;
  scrollRequestNonce: number;
  fetchConversations: () => Promise<void>;
  setCurrentConversation: (id: string | null) => void;
  fetchMessages: (conversationId: string, cursor?: string) => Promise<void>;
  fetchMessagesAround: (conversationId: string, messageId: string) => Promise<void>;
  setScrollToMessageId: (id: string | null) => void;
  addMessage: (message: Message) => void;
  updateMessage: (message: Message) => void;
  removeMessage: (messageId: string) => void;
  clearMessages: () => void;
  addReaction: (messageId: string, emoji: string, userId: string) => void;
  removeReaction: (messageId: string, emoji: string, userId: string) => void;
  updateConversationLastMessage: (
    conversationId: string,
    msg: { content: string | null; authorId: string; createdAt: string },
  ) => void;
  addOrUpdateConversation: (conv: DmConversation) => void;
};

const MAX_MESSAGES = 200;

function toChronological(messagesDesc: Message[]): Message[] {
  return messagesDesc.slice().reverse();
}

function trimOldest(msgs: Message[]): Message[] {
  return msgs.length > MAX_MESSAGES ? msgs.slice(msgs.length - MAX_MESSAGES) : msgs;
}

function trimNewest(msgs: Message[]): Message[] {
  return msgs.length > MAX_MESSAGES ? msgs.slice(0, MAX_MESSAGES) : msgs;
}

export const useDmStore = create<DmState>((set, _get) => ({
  conversations: [],
  currentConversationId: null,
  messages: [],
  hasMore: false,
  hasNewer: false,
  isLoading: false,
  isConversationsLoading: false,
  loadedForConvId: null,
  scrollToMessageId: null,
  scrollRequestNonce: 0,

  fetchConversations: async () => {
    set({ isConversationsLoading: true });
    try {
      const list = await api.getDmConversations();
      set({ conversations: list, isConversationsLoading: false });
    } catch {
      set({ isConversationsLoading: false });
    }
  },

  setCurrentConversation: (id) => set({ currentConversationId: id }),

  fetchMessages: async (conversationId, cursor) => {
    set({ isLoading: true });
    try {
      const page = await api.getDmMessages(conversationId, cursor);
      const chronological = toChronological(page.messages);

      if (cursor) {
        set((s) => {
          const merged = [...chronological, ...s.messages];
          const trimmed = trimNewest(merged);
          return {
            messages: trimmed,
            hasMore: page.hasMore,
            hasNewer: trimmed.length < merged.length ? true : s.hasNewer,
            isLoading: false,
          };
        });
      } else {
        set({
          messages: chronological,
          hasMore: page.hasMore,
          isLoading: false,
          loadedForConvId: conversationId,
        });
      }
    } catch {
      set({ isLoading: false });
    }
  },

  fetchMessagesAround: async (conversationId, messageId) => {
    set({ isLoading: true });
    try {
      const page = await api.getDmMessagesAround(conversationId, messageId);
      const chronological = toChronological(page.messages);
      set({
        messages: chronological,
        hasMore: page.hasMore,
        hasNewer: page.hasNewer ?? false,
        isLoading: false,
        loadedForConvId: conversationId,
      });
    } catch {
      set({ isLoading: false });
    }
  },

  setScrollToMessageId: (id) =>
    set((s) => ({
      scrollToMessageId: id,
      scrollRequestNonce: id !== null ? s.scrollRequestNonce + 1 : s.scrollRequestNonce,
    })),

  addMessage: (message) => {
    set((s) => {
      if (s.hasNewer) return s;
      if (s.messages.some((m) => m.id === message.id)) return s;
      const merged = [...s.messages, message];
      const trimmed = trimOldest(merged);
      return {
        messages: trimmed,
        hasMore: trimmed.length < merged.length ? true : s.hasMore,
      };
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

  clearMessages: () => set({ messages: [], hasMore: false, hasNewer: false, loadedForConvId: null }),

  addReaction: (messageId, emoji, userId) => {
    set((s) => ({
      messages: s.messages.map((m) => {
        if (m.id !== messageId) return m;
        const reactions = [...(m.reactions ?? [])];
        const existing = reactions.find((r) => r.emoji === emoji);
        if (existing) {
          if (!existing.userIds.includes(userId)) {
            existing.userIds = [...existing.userIds, userId];
            existing.count += 1;
          }
        } else {
          reactions.push({ emoji, count: 1, userIds: [userId], isCustom: false });
        }
        return { ...m, reactions };
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
            const userIds = r.userIds.filter((id) => id !== userId);
            return { ...r, userIds, count: userIds.length };
          })
          .filter((r) => r.count > 0);
        return { ...m, reactions };
      }),
    }));
  },

  updateConversationLastMessage: (conversationId, msg) => {
    set((s) => ({
      conversations: s.conversations
        .map((c) =>
          c.id === conversationId ? { ...c, lastMessage: msg } : c,
        )
        .sort((a, b) => {
          const aTime = a.lastMessage?.createdAt ?? a.createdAt;
          const bTime = b.lastMessage?.createdAt ?? b.createdAt;
          return new Date(bTime).getTime() - new Date(aTime).getTime();
        }),
    }));
  },

  addOrUpdateConversation: (conv) => {
    set((s) => {
      const existing = s.conversations.find((c) => c.id === conv.id);
      if (existing) {
        return {
          conversations: s.conversations.map((c) =>
            c.id === conv.id ? { ...c, ...conv } : c,
          ),
        };
      }
      return { conversations: [conv, ...s.conversations] };
    });
  },
}));
