import { useCallback, useEffect, useState } from "react";
import SimpleBar from "simplebar-react";
import { UserAvatar } from "@/components/UserAvatar";
import { api, type DmConversation } from "@/lib/api";

export function GroupDmModal({
  conversations,
  currentUserId,
  onClose,
  onCreated,
  onExisting,
}: {
  conversations: DmConversation[];
  currentUserId: string | undefined;
  onClose: () => void;
  onCreated: (conv: DmConversation) => void;
  onExisting: (convId: string) => void;
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

  const findExisting = useCallback(
    (userIds: string[]): string | null => {
      if (!currentUserId) return null;
      const targetSet = new Set([...userIds, currentUserId]);
      for (const conv of conversations) {
        const memberIds = new Set(conv.members.map((m) => m.userId));
        if (memberIds.size !== targetSet.size) continue;
        if ([...targetSet].every((id) => memberIds.has(id))) return conv.id;
      }
      return null;
    },
    [conversations, currentUserId],
  );

  const handleCreate = async () => {
    if (selected.length === 0) return;
    const existingId = findExisting(selected);
    if (existingId) {
      onExisting(existingId);
      return;
    }
    setCreating(true);
    try {
      const conv = selected.length === 1
        ? await api.createDm(selected[0])
        : await api.createGroupDm(selected);
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
          <h2 className="text-lg font-bold text-white">New Message</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-white">✕</button>
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
                  <button type="button" onClick={() => toggle(id)} aria-label="Remove" className="hover:text-white">✕</button>
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
          disabled={selected.length === 0 || creating}
          onClick={() => void handleCreate()}
          className="mt-4 w-full rounded bg-primary py-2 text-sm font-medium text-white transition hover:bg-primary-hover disabled:opacity-50"
        >
          {creating
            ? "Creating…"
            : selected.length <= 1
              ? "Create DM"
              : `Create Group DM (${selected.length} members)`}
        </button>
      </div>
    </div>
  );
}
