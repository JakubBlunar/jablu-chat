import { useCallback, useEffect, useState } from "react";
import SimpleBar from "simplebar-react";
import { UserAvatar } from "@/components/UserAvatar";
import { api, type DmConversation } from "@/lib/api";
import { useAppNavigate } from "@/hooks/useAppNavigate";
import { useAuthStore } from "@/stores/auth.store";
import { useDmStore } from "@/stores/dm.store";
import { useMemberStore } from "@/stores/member.store";
import { useReadStateStore } from "@/stores/readState.store";

export function DmSidebar() {
  const user = useAuthStore((s) => s.user);
  const conversations = useDmStore((s) => s.conversations);
  const currentConvId = useDmStore((s) => s.currentConversationId);
  const { goToDm, goToDms } = useAppNavigate();
  const fetchConversations = useDmStore((s) => s.fetchConversations);
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

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col bg-surface-dark">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-black/20 px-4 shadow-sm">
        <span className="text-[15px] font-semibold text-white">
          Direct Messages
        </span>
        <button
          type="button"
          title="New Group DM"
          onClick={() => setGroupDmOpen(true)}
          className="rounded p-1 text-gray-400 transition hover:bg-white/10 hover:text-white"
        >
          <PlusIcon />
        </button>
      </div>

      <SimpleBar className="flex min-h-0 flex-1 flex-col gap-0.5 px-2 py-3">
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
            const rs = dmReadStates.get(conv.id);
            const hasUnread = !active && rs && rs.unreadCount > 0;
            return (
              <button
                key={conv.id}
                type="button"
                onClick={() => goToDm(conv.id)}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition ${
                  active
                    ? "bg-surface-selected text-white"
                    : hasUnread
                      ? "font-semibold text-white hover:bg-white/[0.06]"
                      : "text-gray-300 hover:bg-white/[0.06] hover:text-white"
                }`}
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
                {hasUnread && (
                  <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                    {rs!.mentionCount > 0 ? rs!.mentionCount : ""}
                  </span>
                )}
              </button>
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
      </div>

      {groupDmOpen && (
        <GroupDmModal
          onClose={() => setGroupDmOpen(false)}
          onCreated={(conv) => {
            useDmStore.getState().addOrUpdateConversation(conv);
            goToDm(conv.id);
            setGroupDmOpen(false);
          }}
        />
      )}
    </aside>
  );
}

function GroupDmModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (conv: DmConversation) => void;
}) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [results, setResults] = useState<
    { id: string; username: string; displayName: string | null; avatarUrl: string | null }[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const q = search.trim();
    if (!q) { setResults([]); return; }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await api.searchUsers(q);
        setResults(data);
      } catch { setResults([]); }
      setLoading(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const handleCreate = async () => {
    if (selected.length < 2) return;
    setCreating(true);
    try {
      const conv = await api.createGroupDm(selected);
      onCreated(conv);
    } catch {
      /* ignore */
    }
    setCreating(false);
  };

  const toggle = (id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-md rounded-lg bg-surface p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">New Group DM</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-white">✕</button>
        </div>

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search users..."
          className="mb-3 w-full rounded bg-surface-darkest px-3 py-2 text-sm text-white outline-none placeholder:text-gray-500"
        />

        {selected.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-1">
            {selected.map((id) => {
              const u = results.find((r) => r.id === id);
              return (
                <span key={id} className="flex items-center gap-1 rounded-full bg-primary/20 px-2 py-0.5 text-xs text-primary">
                  {u?.displayName ?? u?.username ?? id.slice(0, 8)}
                  <button type="button" onClick={() => toggle(id)} className="hover:text-white">✕</button>
                </span>
              );
            })}
          </div>
        )}

        <SimpleBar className="max-h-40 space-y-1">
          {loading && <p className="text-xs text-gray-400">Searching…</p>}
          {results
            .filter((r) => !selected.includes(r.id))
            .map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => toggle(r.id)}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-gray-200 hover:bg-white/5"
              >
                <UserAvatar username={r.username} avatarUrl={r.avatarUrl} size="sm" />
                {r.displayName ?? r.username}
              </button>
            ))}
        </SimpleBar>

        <button
          type="button"
          disabled={selected.length < 2 || creating}
          onClick={() => void handleCreate()}
          className="mt-4 w-full rounded bg-primary py-2 text-sm font-medium text-white transition hover:bg-primary-hover disabled:opacity-50"
        >
          {creating ? "Creating…" : `Create Group DM (${selected.length} members)`}
        </button>
      </div>
    </div>
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
