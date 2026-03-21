import { useCallback, useEffect, useMemo, useState } from "react";
import { UserAvatar } from "@/components/UserAvatar";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth.store";
import { useDmStore } from "@/stores/dm.store";
import { useMemberStore } from "@/stores/member.store";

export function DmSidebar() {
  const user = useAuthStore((s) => s.user);
  const conversations = useDmStore((s) => s.conversations);
  const currentConvId = useDmStore((s) => s.currentConversationId);
  const setCurrentConv = useDmStore((s) => s.setCurrentConversation);
  const fetchConversations = useDmStore((s) => s.fetchConversations);
  const isLoading = useDmStore((s) => s.isConversationsLoading);
  const onlineIds = useMemberStore((s) => s.onlineUserIds);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  const getDisplayInfo = useCallback(
    (conv: (typeof conversations)[0]) => {
      if (conv.isGroup) {
        return {
          name: conv.groupName || conv.members.map((m) => m.username).join(", "),
          avatarUrl: null,
          status: "online" as const,
          isGroup: true,
        };
      }
      const other = conv.members.find((m) => m.userId !== user?.id);
      return {
        name: other?.username ?? "Unknown",
        avatarUrl: other?.avatarUrl ?? null,
        status: (onlineIds.has(other?.userId ?? "")
          ? "online"
          : "offline") as "online" | "offline",
        isGroup: false,
      };
    },
    [user?.id, onlineIds],
  );

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col bg-[#2b2d31]">
      <div className="flex h-12 shrink-0 items-center border-b border-black/20 px-4 shadow-sm">
        <span className="text-[15px] font-semibold text-white">
          Direct Messages
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-3">
        {isLoading && conversations.length === 0 ? (
          <div className="space-y-2 px-1">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="h-8 w-8 animate-pulse rounded-full bg-white/10" />
                <div className="h-3 flex-1 animate-pulse rounded bg-white/10" />
              </div>
            ))}
          </div>
        ) : conversations.length === 0 ? (
          <p className="px-2 text-sm text-gray-400">
            No conversations yet. Click on a user to start a DM.
          </p>
        ) : (
          conversations.map((conv) => {
            const info = getDisplayInfo(conv);
            const active = conv.id === currentConvId;
            return (
              <button
                key={conv.id}
                type="button"
                onClick={() => setCurrentConv(conv.id)}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition ${
                  active
                    ? "bg-[#404249] text-white"
                    : "text-gray-300 hover:bg-white/[0.06] hover:text-white"
                }`}
              >
                {info.isGroup ? (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#5865f2] text-xs font-bold text-white">
                    {conv.members.length}
                  </div>
                ) : (
                  <UserAvatar
                    username={info.name}
                    avatarUrl={info.avatarUrl}
                    size="md"
                    showStatus
                    status={info.status}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{info.name}</p>
                  {conv.lastMessage && (
                    <p className="truncate text-xs text-gray-400">
                      {conv.lastMessage.content ?? "attachment"}
                    </p>
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>

      <div className="flex h-[52px] shrink-0 items-center gap-2 bg-[#232428] px-2">
        <UserAvatar
          username={user?.username ?? "User"}
          avatarUrl={user?.avatarUrl}
          size="md"
          showStatus
          status={user?.status ?? "online"}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">
            {user?.username ?? "…"}
          </p>
          <p className="truncate text-xs capitalize text-gray-400">
            {user?.status ?? "online"}
          </p>
        </div>
      </div>
    </aside>
  );
}
