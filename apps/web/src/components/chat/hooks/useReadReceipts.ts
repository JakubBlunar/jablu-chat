import type { Message } from "@chat/shared";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { getSocket } from "@/lib/socket";

export function useReadReceipts(
  isDm: boolean,
  contextId: string | null,
  currentConv: {
    isGroup: boolean;
    members: {
      userId: string;
      username: string;
      displayName?: string | null;
    }[];
  } | null,
  userId: string | undefined,
  messages: Message[],
) {
  const [othersReadMap, setOthersReadMap] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (!isDm || !contextId || !currentConv) {
      setOthersReadMap(new Map());
      return;
    }
    api.getDmReadStates(contextId).then((states) => {
      const m = new Map<string, string>();
      for (const s of states) {
        if (s.userId !== userId) m.set(s.userId, s.lastReadAt);
      }
      setOthersReadMap(m);
    }).catch(() => {});
  }, [isDm, contextId, currentConv, userId]);

  useEffect(() => {
    if (!isDm || !contextId) return;
    const socket = getSocket();
    if (!socket) return;
    const onRead = (payload: { conversationId: string; userId: string; lastReadAt: string }) => {
      if (payload.conversationId === contextId && payload.userId !== userId) {
        setOthersReadMap((prev) => {
          const next = new Map(prev);
          next.set(payload.userId, payload.lastReadAt);
          return next;
        });
      }
    };
    socket.on("dm:read", onRead);
    return () => { socket.off("dm:read", onRead); };
  }, [isDm, contextId, userId]);

  const lastOwnMsg = useMemo(() => {
    if (!isDm || othersReadMap.size === 0) return null;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].authorId === userId) return messages[i];
    }
    return null;
  }, [isDm, othersReadMap, messages, userId]);

  const seenByLabel = useMemo(() => {
    if (!lastOwnMsg || !currentConv) return null;
    const names: string[] = [];
    for (const member of currentConv.members) {
      if (member.userId === userId) continue;
      const readAt = othersReadMap.get(member.userId);
      if (readAt && readAt >= lastOwnMsg.createdAt) {
        names.push(member.displayName ?? member.username);
      }
    }
    if (names.length === 0) return null;
    if (!currentConv.isGroup) return "Seen";
    return `Seen by ${names.join(", ")}`;
  }, [lastOwnMsg, currentConv, userId, othersReadMap]);

  return { lastOwnMsg, seenByLabel };
}
