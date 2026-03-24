import { useCallback, useEffect, useMemo, useState } from "react";
import SimpleBar from "simplebar-react";
import { UserAvatar } from "@/components/UserAvatar";
import { useAppNavigate } from "@/hooks/useAppNavigate";
import { useAuthStore } from "@/stores/auth.store";
import { useDmStore } from "@/stores/dm.store";
import { useMemberStore } from "@/stores/member.store";
import { useReadStateStore } from "@/stores/readState.store";
import { GroupDmModal } from "./GroupDmModal";

export function DmSidebar({ onOpenSettings }: { onOpenSettings: () => void }) {
  const user = useAuthStore((s) => s.user);
  const conversations = useDmStore((s) => s.conversations);
  const currentConvId = useDmStore((s) => s.currentConversationId);
  const { goToDm, goToDms } = useAppNavigate();
  const fetchConversations = useDmStore((s) => s.fetchConversations);
  const closeConversation = useDmStore((s) => s.closeConversation);
  const isLoading = useDmStore((s) => s.isConversationsLoading);
  const onlineIds = useMemberStore((s) => s.onlineUserIds);
  const dmReadStates = useReadStateStore((s) => s.dms);
  const ackDm = useReadStateStore((s) => s.ackDm);
  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  useEffect(() => {
    if (!currentConvId || isLoading || conversations.length === 0) return;
    const exists = conversations.some((c) => c.id === currentConvId);
    if (!exists) {
      goToDms();
    }
  }, [currentConvId, conversations, isLoading, goToDms]);

  useEffect(() => {
    if (currentConvId) ackDm(currentConvId);
  }, [currentConvId, ackDm]);

  const getDisplayInfo = useCallback(
    (conv: (typeof conversations)[0]) => {
      if (conv.isGroup) {
        return {
          name: conv.groupName || conv.members.map((m) => m.displayName ?? m.username).join(", "),
          avatarUrl: null,
          status: "online" as const,
          isGroup: true,
        };
      }
      const other = conv.members.find((m) => m.userId !== user?.id);
      return {
        name: other?.displayName ?? other?.username ?? "Unknown",
        avatarUrl: other?.avatarUrl ?? null,
        status: (onlineIds.has(other?.userId ?? "")
          ? "online"
          : "offline") as "online" | "offline",
        isGroup: false,
      };
    },
    [user?.id, onlineIds],
  );

  const [groupDmOpen, setGroupDmOpen] = useState(false);
  const [filter, setFilter] = useState("");

  const filteredConversations = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((conv) => {
      if (conv.isGroup) {
        const groupLabel = conv.groupName || conv.members.map((m) => m.displayName ?? m.username).join(", ");
        return groupLabel.toLowerCase().includes(q);
      }
      const other = conv.members.find((m) => m.userId !== user?.id);
      if (!other) return false;
      return (
        other.username.toLowerCase().includes(q) ||
        (other.displayName?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [conversations, filter, user?.id]);

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col bg-surface-dark">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-black/20 px-4 shadow-sm">
        <span className="text-[15px] font-semibold text-white">
          Direct Messages
        </span>
        <button
          type="button"
          title="New Message"
          aria-label="New Message"
          onClick={() => setGroupDmOpen(true)}
          className="rounded p-1 text-gray-400 transition hover:bg-white/10 hover:text-white"
        >
          <PlusIcon />
        </button>
      </div>

      <div className="shrink-0 px-2 pt-2.5 pb-1">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Find a conversation"
          className="w-full rounded bg-surface-darkest px-2.5 py-1.5 text-sm text-white outline-none placeholder:text-gray-500"
        />
      </div>

      <SimpleBar className="flex min-h-0 flex-1 flex-col gap-0.5 px-2 py-1.5">
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
        ) : filteredConversations.length === 0 ? (
          <p className="px-2 text-sm text-gray-400">No matching conversations</p>
        ) : (
          filteredConversations.map((conv) => {
            const info = getDisplayInfo(conv);
            const active = conv.id === currentConvId;
            const rs = dmReadStates.get(conv.id);
            const hasUnread = !active && rs && rs.unreadCount > 0;
            return (
              <div
                key={conv.id}
                className={`group relative flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition ${
                  active
                    ? "bg-surface-selected text-white"
                    : hasUnread
                      ? "font-semibold text-white hover:bg-white/[0.06]"
                      : "text-gray-300 hover:bg-white/[0.06] hover:text-white"
                }`}
              >
                <button
                  type="button"
                  onClick={() => goToDm(conv.id)}
                  className="flex min-w-0 flex-1 items-center gap-2"
                >
                  {info.isGroup ? (
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
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
                {hasUnread && (
                  <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                    {rs!.mentionCount > 10 ? "10+" : rs!.mentionCount > 0 ? rs!.mentionCount : ""}
                  </span>
                )}
                <button
                  type="button"
                  title="Close conversation"
                  onClick={(e) => {
                    e.stopPropagation();
                    void closeConversation(conv.id);
                    if (active) goToDms();
                  }}
                  className="shrink-0 rounded p-0.5 text-gray-400 opacity-100 transition hover:bg-white/10 hover:text-white md:opacity-0 md:group-hover:opacity-100"
                >
                  <CloseIcon />
                </button>
              </div>
            );
          })
        )}
      </SimpleBar>

      <div className="flex h-[52px] shrink-0 items-center gap-2 bg-surface-overlay px-2">
        <UserAvatar
          username={user?.username ?? "User"}
          avatarUrl={user?.avatarUrl}
          size="md"
          showStatus
          status={user?.status ?? "online"}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">
            {user?.displayName ?? user?.username ?? "…"}
          </p>
          <p className="truncate text-xs capitalize text-gray-400">
            {user?.status ?? "online"}
          </p>
        </div>
        <button
          type="button"
          title="User settings"
          aria-label="User settings"
          onClick={onOpenSettings}
          className="rounded-md p-1.5 text-gray-400 transition hover:bg-white/10 hover:text-white"
        >
          <GearIcon />
        </button>
      </div>

      {groupDmOpen && (
        <GroupDmModal
          conversations={conversations}
          currentUserId={user?.id}
          onClose={() => setGroupDmOpen(false)}
          onCreated={(conv) => {
            useDmStore.getState().addOrUpdateConversation(conv);
            goToDm(conv.id);
            setGroupDmOpen(false);
          }}
          onExisting={(convId) => {
            goToDm(convId);
            setGroupDmOpen(false);
          }}
        />
      )}
    </aside>
  );
}

function CloseIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58a.5.5 0 00.12-.64l-1.92-3.32a.5.5 0 00-.6-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.5.5 0 00-.49-.42h-3.84a.5.5 0 00-.49.42l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.5.5 0 00-.6.22L2.74 8.87c-.17.29-.11.67.19.86l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.5.5 0 00-.12.64l1.92 3.32c.17.29.49.38.78.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54a.5.5 0 00.49.42h3.84c.24 0 .45-.17.49-.42l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.29.15.62.06.78-.22l1.92-3.32c.17-.29.11-.67-.19-.86l-2.03-1.58zM12 15.6A3.6 3.6 0 1112 8.4a3.6 3.6 0 010 7.2z" />
    </svg>
  );
}
