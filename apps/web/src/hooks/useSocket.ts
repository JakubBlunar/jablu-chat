import type { LinkPreview, Message } from "@chat/shared";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { showNotification } from "@/lib/notifications";
import { connectSocket, disconnectSocket, getSocket } from "@/lib/socket";
import { useAuthStore } from "@/stores/auth.store";
import { useChannelStore } from "@/stores/channel.store";
import { useDmStore } from "@/stores/dm.store";
import { useServerStore } from "@/stores/server.store";
import { useMemberStore } from "@/stores/member.store";
import { useMessageStore } from "@/stores/message.store";
import { useNotifPrefStore } from "@/stores/notifPref.store";
import { useReadStateStore } from "@/stores/readState.store";
import { useVoiceStore, type VoiceParticipant } from "@/stores/voice.store";
import { useVoiceConnectionStore } from "@/stores/voice-connection.store";
import { playJoinSound, playLeaveSound } from "@/lib/sounds";

type MessageDeletePayload = {
  messageId: string;
  channelId: string;
};

type TypingPayload = {
  userId: string;
  channelId: string;
  username: string;
};

type OnlinePayload = {
  userId: string;
};

type StatusPayload = {
  userId: string;
  status: string;
};

type ReactionPayload = {
  messageId: string;
  emoji: string;
  userId: string;
  isCustom: boolean;
  conversationId?: string;
};

type LinkPreviewPayload = {
  messageId: string;
  linkPreviews: LinkPreview[];
};

type DmMessagePayload = Message & { conversationId: string };
type DmDeletePayload = { messageId: string; conversationId: string };
type DmTypingPayload = {
  userId: string;
  conversationId: string;
  username: string;
};
type DmLinkPreviewPayload = LinkPreviewPayload & { conversationId: string };

export function useSocket(): { socket: ReturnType<typeof getSocket>; isConnected: boolean } {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!accessToken) {
      disconnectSocket();
      setIsConnected(false);
      return;
    }

    const socket = connectSocket(accessToken);

    let handlingAuthError = false;
    let hasConnectedBefore = false;
    let lastAckTs = 0;
    const throttledAck = (fn: () => void) => {
      const now = Date.now();
      if (now - lastAckTs > 3000) {
        lastAckTs = now;
        fn();
      }
    };
    const onConnect = () => {
      setIsConnected(true);
      if (hasConnectedBefore) {
        const channelId = useChannelStore.getState().currentChannelId;
        if (channelId) {
          socket.emit("channel:join", { channelId });
        }
        const convId = useDmStore.getState().currentConversationId;
        if (convId) {
          socket.emit("dm:join", { conversationId: convId });
        }
      }
      hasConnectedBefore = true;
    };
    const onDisconnect = () => setIsConnected(false);
    const onConnectError = async () => {
      if (handlingAuthError) return;
      const store = useAuthStore.getState();
      if (!store.isAuthenticated || !store.refreshToken) return;
      handlingAuthError = true;
      try {
        await store.refreshSession();
        const newToken = useAuthStore.getState().accessToken;
        if (newToken) {
          socket.auth = { token: newToken };
        }
      } catch (err: unknown) {
        const status = (err as { status?: number }).status;
        if (status === 401 || status === 403) {
          socket.disconnect();
          api.onAuthFailure?.();
        }
      } finally {
        handlingAuthError = false;
      }
    };

    const onMessageNew = (msg: Message & { mentionedUserIds?: string[]; serverId?: string }) => {
      const channelId = useChannelStore.getState().currentChannelId;
      const viewMode = useServerStore.getState().viewMode;
      const myId = useAuthStore.getState().user?.id;
      const isViewingChannel = viewMode === "server" && msg.channelId != null && msg.channelId === channelId;
      if (isViewingChannel) {
        useMessageStore.getState().addMessage(msg);
        throttledAck(() => useReadStateStore.getState().ackChannel(channelId!));
      } else if (msg.channelId && msg.authorId !== myId) {
        const isMentioned = myId
          ? (msg.mentionedUserIds ?? []).includes(myId)
          : false;
        useReadStateStore.getState().incrementChannel(msg.channelId, isMentioned, msg.serverId);

        const level = useNotifPrefStore.getState().get(msg.channelId);
        if (level !== "none" && (level !== "mentions" || isMentioned)) {
          const author = msg.author?.displayName ?? msg.author?.username ?? "Someone";
          const body = msg.content?.slice(0, 100) ?? "[attachment]";
          const url = msg.serverId ? `/channels/${msg.serverId}/${msg.channelId}` : undefined;
          showNotification(`#${msg.channelId.slice(0, 8)}`, `${author}: ${body}`, url);
        }
      }
    };

    const onMessageEdit = (msg: Message) => {
      const channelId = useChannelStore.getState().currentChannelId;
      if (msg.channelId != null && msg.channelId === channelId) {
        useMessageStore.getState().updateMessage(msg);
      }
    };

    const onMessageDelete = (payload: MessageDeletePayload) => {
      const channelId = useChannelStore.getState().currentChannelId;
      if (payload.channelId === channelId) {
        useMessageStore.getState().removeMessage(payload.messageId);
      }
    };

    const onUserOnline = (payload: OnlinePayload) => {
      useMemberStore.getState().setUserOnline(payload.userId);
      const currentUser = useAuthStore.getState().user;
      if (currentUser && currentUser.id === payload.userId) {
        useAuthStore.getState().setUser({ ...currentUser, status: "online" });
      }
    };

    const onUserOffline = (payload: OnlinePayload) => {
      useMemberStore.getState().setUserOffline(payload.userId);
    };

    const onUserStatus = (payload: StatusPayload) => {
      useMemberStore.getState().setUserStatus(payload.userId, payload.status);
      const currentUser = useAuthStore.getState().user;
      if (currentUser && currentUser.id === payload.userId) {
        useAuthStore.getState().setUser({ ...currentUser, status: payload.status as "online" | "idle" | "dnd" | "offline" });
      }
    };

    const onUserTyping = (payload: TypingPayload) => {
      const channelId = useChannelStore.getState().currentChannelId;
      if (payload.channelId === channelId) {
        useMessageStore
          .getState()
          .setTypingUser(payload.channelId, payload.userId, payload.username);
      }
    };

    const onReactionAdd = (payload: ReactionPayload) => {
      if (payload.conversationId) {
        useDmStore.getState().addReaction(payload.messageId, payload.emoji, payload.userId);
      } else {
        useMessageStore.getState().addReaction(payload.messageId, payload.emoji, payload.userId);
      }
    };

    const onReactionRemove = (payload: ReactionPayload) => {
      if (payload.conversationId) {
        useDmStore.getState().removeReaction(payload.messageId, payload.emoji, payload.userId);
      } else {
        useMessageStore.getState().removeReaction(payload.messageId, payload.emoji, payload.userId);
      }
    };

    const onMessagePin = (msg: Message) => {
      useMessageStore.getState().updateMessage(msg);
      if (msg.channelId) {
        useChannelStore.getState().adjustPinnedCount(msg.channelId, 1);
      }
    };

    const onMessageUnpin = (msg: Message) => {
      useMessageStore.getState().updateMessage(msg);
      if (msg.channelId) {
        useChannelStore.getState().adjustPinnedCount(msg.channelId, -1);
      }
    };

    const onLinkPreviews = (payload: LinkPreviewPayload) => {
      useMessageStore
        .getState()
        .setLinkPreviews(payload.messageId, payload.linkPreviews);
    };

    const onPresenceInit = (payload: { onlineUserIds: string[] }) => {
      useMemberStore.getState().initOnlineUsers(payload.onlineUserIds);
      const currentUser = useAuthStore.getState().user;
      if (currentUser && payload.onlineUserIds.includes(currentUser.id)) {
        useAuthStore.getState().setUser({ ...currentUser, status: "online" });
      }
      useReadStateStore.getState().fetchAll();
      useNotifPrefStore.getState().fetchAll();
    };

    const onDmNew = (payload: DmMessagePayload) => {
      const dmState = useDmStore.getState();
      const currentConvId = dmState.currentConversationId;
      const viewMode = useServerStore.getState().viewMode;
      const myId = useAuthStore.getState().user?.id;
      const isViewingConversation = viewMode === "dm" && payload.conversationId === currentConvId;
      if (isViewingConversation) {
        dmState.addMessage(payload);
        throttledAck(() => useReadStateStore.getState().ackDm(currentConvId!));
      } else if (payload.authorId !== myId) {
        useReadStateStore.getState().incrementDm(payload.conversationId);
        const author = payload.author?.displayName ?? payload.author?.username ?? "Someone";
        const body = payload.content?.slice(0, 100) ?? "[attachment]";
        const url = `/channels/@me/${payload.conversationId}`;
        showNotification("Direct Message", `${author}: ${body}`, url);
      }

      const inList = dmState.conversations.some((c) => c.id === payload.conversationId);
      if (!inList) {
        api.getDmConversation(payload.conversationId).then((conv) => {
          useDmStore.getState().addOrUpdateConversation(conv);
        }).catch(() => {});
      }

      dmState.updateConversationLastMessage(
        payload.conversationId,
        {
          content: payload.content ?? null,
          authorId: payload.authorId ?? "",
          createdAt: payload.createdAt,
        },
      );
    };

    const onDmEdit = (payload: DmMessagePayload) => {
      const currentConvId = useDmStore.getState().currentConversationId;
      if (payload.conversationId === currentConvId) {
        useDmStore.getState().updateMessage(payload);
      }
    };

    const onDmDelete = (payload: DmDeletePayload) => {
      const currentConvId = useDmStore.getState().currentConversationId;
      if (payload.conversationId === currentConvId) {
        useDmStore.getState().removeMessage(payload.messageId);
      }
    };

    const onDmTyping = (_payload: DmTypingPayload) => {
      // Could add DM typing indicators in the future
    };

    const onVoiceParticipants = (
      state: Record<string, VoiceParticipant[]>,
    ) => {
      useVoiceStore.getState().setAll(state);
    };

    const onVoiceParticipantJoined = (payload: {
      channelId: string;
      userId: string;
      username: string;
    }) => {
      useVoiceStore
        .getState()
        .addParticipant(payload.channelId, {
          userId: payload.userId,
          username: payload.username,
        });
      const myVoiceChannel = useVoiceConnectionStore.getState().currentChannelId;
      const myId = useAuthStore.getState().user?.id;
      if (myVoiceChannel === payload.channelId && payload.userId !== myId) {
        playJoinSound();
      }
    };

    const onVoiceParticipantLeft = (payload: {
      channelId: string;
      userId: string;
    }) => {
      useVoiceStore
        .getState()
        .removeParticipant(payload.channelId, payload.userId);
      const myVoiceChannel = useVoiceConnectionStore.getState().currentChannelId;
      const myId = useAuthStore.getState().user?.id;
      if (myVoiceChannel === payload.channelId && payload.userId !== myId) {
        playLeaveSound();
      }
    };

    const onVoiceParticipantState = (payload: {
      channelId: string;
      userId: string;
      muted?: boolean;
      deafened?: boolean;
      camera?: boolean;
      screenShare?: boolean;
    }) => {
      const update: Partial<Pick<VoiceParticipant, "muted" | "deafened" | "camera" | "screenShare">> = {};
      if (payload.muted !== undefined) update.muted = payload.muted;
      if (payload.deafened !== undefined) update.deafened = payload.deafened;
      if (payload.camera !== undefined) update.camera = payload.camera;
      if (payload.screenShare !== undefined) update.screenShare = payload.screenShare;

      useVoiceStore.getState().updateParticipantState(
        payload.channelId,
        payload.userId,
        update,
      );
    };

    const onChannelReorder = (payload: { channelIds: string[] }) => {
      useChannelStore.getState().applyReorder(payload.channelIds);
    };

    const onDmLinkPreviews = (payload: DmLinkPreviewPayload) => {
      const currentConvId = useDmStore.getState().currentConversationId;
      if (payload.conversationId === currentConvId) {
        const msgs = useDmStore.getState().messages;
        const msg = msgs.find((m) => m.id === payload.messageId);
        if (msg) {
          useDmStore.getState().updateMessage({
            ...msg,
            linkPreviews: payload.linkPreviews,
          });
        }
      }
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onConnectError);
    socket.on("message:new", onMessageNew);
    socket.on("message:edit", onMessageEdit);
    socket.on("message:delete", onMessageDelete);
    socket.on("user:online", onUserOnline);
    socket.on("user:offline", onUserOffline);
    socket.on("user:status", onUserStatus);
    socket.on("user:typing", onUserTyping);
    socket.on("reaction:add", onReactionAdd);
    socket.on("reaction:remove", onReactionRemove);
    socket.on("message:pin", onMessagePin);
    socket.on("message:unpin", onMessageUnpin);
    socket.on("message:link-previews", onLinkPreviews);
    socket.on("presence:init", onPresenceInit);
    socket.on("dm:new", onDmNew);
    socket.on("dm:edit", onDmEdit);
    socket.on("dm:delete", onDmDelete);
    socket.on("dm:typing", onDmTyping);
    socket.on("dm:link-previews", onDmLinkPreviews);
    socket.on("voice:participants", onVoiceParticipants);
    socket.on("voice:participant-joined", onVoiceParticipantJoined);
    socket.on("voice:participant-left", onVoiceParticipantLeft);
    socket.on("voice:participant-state", onVoiceParticipantState);
    socket.on("channel:reorder", onChannelReorder);

    setIsConnected(socket.connected);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onConnectError);
      socket.off("message:new", onMessageNew);
      socket.off("message:edit", onMessageEdit);
      socket.off("message:delete", onMessageDelete);
      socket.off("user:online", onUserOnline);
      socket.off("user:offline", onUserOffline);
      socket.off("user:status", onUserStatus);
      socket.off("user:typing", onUserTyping);
      socket.off("reaction:add", onReactionAdd);
      socket.off("reaction:remove", onReactionRemove);
      socket.off("message:pin", onMessagePin);
      socket.off("message:unpin", onMessageUnpin);
      socket.off("message:link-previews", onLinkPreviews);
      socket.off("presence:init", onPresenceInit);
      socket.off("dm:new", onDmNew);
      socket.off("dm:edit", onDmEdit);
      socket.off("dm:delete", onDmDelete);
      socket.off("dm:typing", onDmTyping);
      socket.off("dm:link-previews", onDmLinkPreviews);
      socket.off("voice:participants", onVoiceParticipants);
      socket.off("voice:participant-joined", onVoiceParticipantJoined);
      socket.off("voice:participant-left", onVoiceParticipantLeft);
      socket.off("voice:participant-state", onVoiceParticipantState);
      socket.off("channel:reorder", onChannelReorder);
      disconnectSocket();
      setIsConnected(false);
    };
  }, [accessToken]);

  return { socket: getSocket(), isConnected };
}
