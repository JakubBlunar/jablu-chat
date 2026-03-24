import type { Message } from "@chat/shared";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { getSocket } from "@/lib/socket";

export function usePinnedMessages(channelId: string | null) {
  const [pinnedOpen, setPinnedOpen] = useState(false);
  const [pinnedMessages, setPinnedMessages] = useState<Message[]>([]);
  const [pinnedLoading, setPinnedLoading] = useState(false);

  useEffect(() => {
    setPinnedOpen(false);
    setPinnedMessages([]);
  }, [channelId]);

  const handleOpenPinned = useCallback(async () => {
    if (!channelId) return;
    if (pinnedOpen) { setPinnedOpen(false); return; }
    setPinnedOpen(true);
    setPinnedLoading(true);
    try {
      const msgs = await api.getPinnedMessages(channelId);
      setPinnedMessages(msgs);
    } catch {
      setPinnedMessages([]);
    } finally {
      setPinnedLoading(false);
    }
  }, [channelId, pinnedOpen]);

  useEffect(() => {
    if (!pinnedOpen || !channelId) return;
    const socket = getSocket();
    if (!socket) return;
    const onPin = (msg: Message) => {
      if (msg.channelId === channelId) {
        setPinnedMessages((prev) =>
          prev.some((m) => m.id === msg.id) ? prev : [msg, ...prev],
        );
      }
    };
    const onUnpin = (msg: Message) => {
      if (msg.channelId === channelId) {
        setPinnedMessages((prev) => prev.filter((m) => m.id !== msg.id));
      }
    };
    socket.on("message:pin", onPin);
    socket.on("message:unpin", onUnpin);
    return () => {
      socket.off("message:pin", onPin);
      socket.off("message:unpin", onUnpin);
    };
  }, [pinnedOpen, channelId]);

  return { pinnedOpen, pinnedMessages, pinnedLoading, handleOpenPinned, setPinnedOpen };
}
