import { useCallback, useEffect, useRef, useState } from "react";
import SimpleBar from "simplebar-react";
import { UserAvatar } from "@/components/UserAvatar";
import { api, type SearchResult } from "@/lib/api";
import { useAppNavigate } from "@/hooks/useAppNavigate";
import { useChannelStore } from "@/stores/channel.store";
import { useServerStore } from "@/stores/server.store";

type Scope = "server" | "channel" | "conversation" | "dm" | "all";
const PAGE_SIZE = 25;

type Props = {
  query: string;
  onQueryChange: (q: string) => void;
  onClose: () => void;
  defaultScope?: Scope;
  conversationId?: string;
};

export function SearchDrawer({ query, onQueryChange, onClose, defaultScope = "server", conversationId }: Props) {
  const currentServerId = useServerStore((s) => s.currentServerId);
  const currentChannelId = useChannelStore((s) => s.currentChannelId);
  const channels = useChannelStore((s) => s.channels);
  const currentChannel = channels.find((c) => c.id === currentChannelId);
  const { orchestratedGoToChannel, orchestratedGoToDm } = useAppNavigate();

  const [scope, setScope] = useState<Scope>(defaultScope);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [localQuery, setLocalQuery] = useState(query);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLocalQuery(query);
  }, [query]);

  const doSearch = useCallback(
    async (q: string, s: Scope, off: number) => {
      if (!q.trim()) {
        setResults([]);
        setTotal(0);
        return;
      }
      setLoading(true);
      setError(false);
      try {
        const opts: Parameters<typeof api.searchMessages>[1] = { offset: off };
        if (s === "server" && currentServerId) opts.serverId = currentServerId;
        else if (s === "channel" && currentChannelId) opts.channelId = currentChannelId;
        else if (s === "conversation" && conversationId) opts.conversationId = conversationId;
        else if (s === "dm") opts.dmOnly = true;
        const data = await api.searchMessages(q, opts);
        setResults(data.results);
        setTotal(data.total);
      } catch {
        setResults([]);
        setTotal(0);
        setError(true);
      } finally {
        setLoading(false);
      }
    },
    [currentServerId, currentChannelId, conversationId],
  );

  useEffect(() => {
    if (query.trim()) {
      void doSearch(query, scope, offset);
    }
  }, [query, scope, offset, doSearch]);

  function handleLocalChange(value: string) {
    setLocalQuery(value);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (value.trim()) {
      timerRef.current = setTimeout(() => {
        setOffset(0);
        onQueryChange(value);
      }, 400);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && localQuery.trim()) {
      if (timerRef.current) clearTimeout(timerRef.current);
      setOffset(0);
      onQueryChange(localQuery);
    }
    if (e.key === "Escape") onClose();
  }

  function handleScopeChange(s: Scope) {
    setScope(s);
    setOffset(0);
  }

  function handleResultClick(result: SearchResult) {
    setActiveId(result.id);
    if (result.channelId) {
      const serverId = result.channel?.serverId ?? currentServerId;
      if (serverId) void orchestratedGoToChannel(serverId, result.channelId, result.id);
    } else if (result.dmConversationId) {
      void orchestratedGoToDm(result.dmConversationId, result.id);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <aside className="flex h-full w-full shrink-0 flex-col border-l border-white/10 bg-surface-dark md:w-80">
      {/* Header */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-black/20 px-4">
        <h2 className="text-sm font-semibold text-white">Search Results</h2>
        <button
          type="button"
          aria-label="Close search"
          onClick={onClose}
          className="rounded p-1 text-gray-400 transition hover:bg-white/10 hover:text-white"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Search input */}
      <div className="border-b border-white/10 px-3 py-2">
        <div className="flex items-center rounded bg-surface-darkest px-2">
          <svg className="h-4 w-4 shrink-0 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={localQuery}
            onChange={(e) => handleLocalChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search..."
            className="w-full bg-transparent px-2 py-1.5 text-sm text-gray-200 outline-none placeholder:text-gray-500"
          />
        </div>
      </div>

      {/* Scope selector */}
      <div className="flex items-center gap-1 border-b border-white/10 px-3 py-2">
        {defaultScope === "conversation" ? (
          <>
            <ScopeBtn active={scope === "conversation"} onClick={() => handleScopeChange("conversation")}>
              This conversation
            </ScopeBtn>
            <ScopeBtn active={scope === "dm"} onClick={() => handleScopeChange("dm")}>
              All DMs
            </ScopeBtn>
            <ScopeBtn active={scope === "all"} onClick={() => handleScopeChange("all")}>
              Everywhere
            </ScopeBtn>
          </>
        ) : (
          <>
            {currentChannelId && (
              <ScopeBtn active={scope === "channel"} onClick={() => handleScopeChange("channel")}>
                #{currentChannel?.name}
              </ScopeBtn>
            )}
            <ScopeBtn active={scope === "server"} onClick={() => handleScopeChange("server")}>
              Server
            </ScopeBtn>
            <ScopeBtn active={scope === "all"} onClick={() => handleScopeChange("all")}>
              Everywhere
            </ScopeBtn>
          </>
        )}
      </div>

      {/* Result count */}
      {query.trim() && !loading && (
        <div className="border-b border-white/10 px-3 py-1.5">
          <span className="text-xs text-gray-500">
            {total} {total === 1 ? "result" : "results"}
          </span>
        </div>
      )}

      {/* Results */}
      <SimpleBar className="min-h-0 flex-1">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-600 border-t-primary" />
          </div>
        ) : error ? (
          <div className="px-3 py-8 text-center text-sm text-gray-400">
            <p>Search failed</p>
            <button
              type="button"
              className="mt-2 text-xs text-primary hover:underline"
              onClick={() => doSearch(query, scope, offset)}
            >
              Try again
            </button>
          </div>
        ) : results.length === 0 && query.trim() ? (
          <p className="px-3 py-8 text-center text-sm text-gray-400">No results found</p>
        ) : (
          <div className="py-1">
            {results.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => handleResultClick(r)}
                className={`flex w-full items-start gap-3 px-3 py-2.5 text-left transition hover:bg-white/5 ${
                  activeId === r.id ? "bg-white/[0.08]" : ""
                }`}
              >
                <UserAvatar
                  username={r.author?.username ?? "Deleted User"}
                  avatarUrl={r.author?.avatarUrl ?? null}
                  size="sm"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="truncate text-sm font-medium text-white">
                      {r.author?.displayName ?? r.author?.username ?? "Deleted User"}
                    </span>
                    {r.channel ? (
                      <span className="shrink-0 text-[11px] text-gray-500">
                        #{r.channel.name}
                      </span>
                    ) : r.dmConversationId ? (
                      <span className="shrink-0 text-[11px] text-gray-500">DM</span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-gray-300">
                    {r.content}
                  </p>
                  <time className="mt-1 block text-[10px] text-gray-500">
                    {new Date(r.createdAt).toLocaleString()}
                  </time>
                </div>
              </button>
            ))}
          </div>
        )}
      </SimpleBar>

      {/* Pagination */}
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between border-t border-white/10 px-3 py-2">
          <button
            type="button"
            disabled={currentPage <= 1}
            onClick={() => setOffset(offset - PAGE_SIZE)}
            className="rounded px-2 py-1 text-xs font-medium text-gray-300 transition hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent"
          >
            Previous
          </button>
          <span className="text-xs text-gray-500">
            {currentPage} / {totalPages}
          </span>
          <button
            type="button"
            disabled={currentPage >= totalPages}
            onClick={() => setOffset(offset + PAGE_SIZE)}
            className="rounded px-2 py-1 text-xs font-medium text-gray-300 transition hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent"
          >
            Next
          </button>
        </div>
      )}
    </aside>
  );
}

function ScopeBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded px-2 py-0.5 text-xs font-medium transition ${
        active
          ? "bg-primary text-white"
          : "text-gray-400 hover:bg-white/10 hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}
