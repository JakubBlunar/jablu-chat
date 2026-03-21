import { useCallback, useEffect, useRef, useState } from "react";
import { api, type SearchResult } from "@/lib/api";
import { UserAvatar } from "@/components/UserAvatar";
import { useChannelStore } from "@/stores/channel.store";
import { useServerStore } from "@/stores/server.store";

export function SearchBar() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const wrapRef = useRef<HTMLDivElement>(null);
  const currentServerId = useServerStore((s) => s.currentServerId);
  const setCurrentChannel = useChannelStore((s) => s.setCurrentChannel);

  const doSearch = useCallback(
    async (q: string) => {
      if (!q.trim()) {
        setResults([]);
        return;
      }
      setLoading(true);
      try {
        const data = await api.searchMessages(q, {
          serverId: currentServerId ?? undefined,
        });
        setResults(data.results);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    },
    [currentServerId],
  );

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!query.trim()) {
      setResults([]);
      return;
    }
    timerRef.current = setTimeout(() => {
      void doSearch(query);
    }, 400);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query, doSearch]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleResultClick(result: SearchResult) {
    if (result.channelId) {
      setCurrentChannel(result.channelId);
    }
    setOpen(false);
    setQuery("");
    setResults([]);
  }

  return (
    <div ref={wrapRef} className="relative">
      <div className="flex items-center rounded bg-[#1e1f22] px-2">
        <SearchIcon />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search messages..."
          className="w-44 bg-transparent px-2 py-1.5 text-sm text-gray-200 outline-none placeholder:text-gray-500"
        />
      </div>

      {open && (query.trim() || results.length > 0) && (
        <div className="absolute right-0 top-full z-50 mt-1 w-96 rounded-lg bg-[#2b2d31] shadow-xl ring-1 ring-white/10">
          {loading ? (
            <p className="p-4 text-center text-sm text-gray-400">
              Searching...
            </p>
          ) : results.length === 0 && query.trim() ? (
            <p className="p-4 text-center text-sm text-gray-400">
              No results found
            </p>
          ) : (
            <div className="max-h-80 overflow-y-auto py-1">
              {results.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => handleResultClick(r)}
                  className="flex w-full items-start gap-3 px-3 py-2 text-left transition hover:bg-white/5"
                >
                  <UserAvatar
                    username={r.author.username}
                    avatarUrl={r.author.avatarUrl}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-medium text-white">
                        {r.author.username}
                      </span>
                      {r.channel && (
                        <span className="text-xs text-gray-500">
                          #{r.channel.name}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-xs text-gray-300">
                      {r.content}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SearchIcon() {
  return (
    <svg className="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}
