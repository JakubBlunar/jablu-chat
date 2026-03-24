import { useEffect, useState } from "react";
import { getSocket } from "@/lib/socket";
import { useMessageStore } from "@/stores/message.store";
import { useShallow } from "zustand/react/shallow";

export function useTypingIndicators(
  isDm: boolean,
  contextId: string | null,
  userId: string | undefined,
) {
  const channelTypingNames = useMessageStore(
    useShallow((s) => {
      const out: string[] = [];
      for (const [uid, entry] of s.typingUsers) {
        if (uid !== userId) out.push(entry.username);
      }
      return out.length > 4 ? out.slice(0, 4) : out;
    }),
  );

  const [dmTypingUsers, setDmTypingUsers] = useState<string[]>([]);

  useEffect(() => {
    if (!isDm) return;
    const socket = getSocket();
    if (!socket) return;
    const onTyping = (payload: { conversationId: string; username: string }) => {
      if (payload.conversationId !== contextId) return;
      setDmTypingUsers((prev) =>
        prev.includes(payload.username) ? prev : [...prev, payload.username],
      );
      setTimeout(() => {
        setDmTypingUsers((prev) => prev.filter((u) => u !== payload.username));
      }, 3000);
    };
    socket.on("dm:typing", onTyping);
    return () => { socket.off("dm:typing", onTyping); };
  }, [isDm, contextId]);

  useEffect(() => {
    if (isDm) setDmTypingUsers([]);
  }, [isDm, contextId]);

  return isDm ? dmTypingUsers : channelTypingNames;
}

export function formatTyping(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return `${names[0]} is typing…`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
  return "Several people are typing…";
}
