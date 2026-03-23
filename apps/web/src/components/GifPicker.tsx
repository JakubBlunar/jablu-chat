import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api, type GifResult } from "@/lib/api";
import { useIsMobile } from "@/hooks/useMobile";

interface GifPickerProps {
  onSelect: (gifUrl: string) => void;
  onClose: () => void;
}

export function GifPicker({ onSelect, onClose }: GifPickerProps) {
  const isMobile = useIsMobile();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  const content = (
    <GifPickerContent onSelect={onSelect} onClose={onClose} />
  );

  if (isMobile) {
    return createPortal(
      <div
        className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60"
        onClick={onClose}
      >
        <div
          ref={ref}
          className="relative flex max-h-[80vh] w-[90vw] max-w-sm flex-col overflow-hidden rounded-xl bg-surface-dark shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-2">
            <span className="text-sm font-semibold text-white">GIFs</span>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-1 text-gray-400 hover:bg-white/10 hover:text-white"
            >
              <XIcon />
            </button>
          </div>
          {content}
        </div>
      </div>,
      document.body,
    );
  }

  return (
    <div
      ref={ref}
      className="z-50 flex max-h-[420px] w-[340px] flex-col overflow-hidden rounded-xl bg-surface-dark shadow-2xl ring-1 ring-white/10"
    >
      {content}
    </div>
  );
}

function GifPickerContent({
  onSelect,
  onClose,
}: {
  onSelect: (url: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GifResult[]>([]);
  const [nextPos, setNextPos] = useState("");
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchGifs = useCallback(
    async (q: string, pos?: string) => {
      setLoading(true);
      try {
        const data = q.trim()
          ? await api.searchGifs(q.trim(), 20, pos)
          : await api.getTrendingGifs(20, pos);
        if (pos) {
          setResults((prev) => [...prev, ...data.results]);
        } else {
          setResults(data.results);
        }
        setNextPos(data.next);
      } catch {
        /* swallow */
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    fetchGifs("");
  }, [fetchGifs]);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setResults([]);
      setNextPos("");
      fetchGifs(query);
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [query, fetchGifs]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || loading || !nextPos) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 100) {
      fetchGifs(query, nextPos);
    }
  }, [loading, nextPos, query, fetchGifs]);

  const left: GifResult[] = [];
  const right: GifResult[] = [];
  let leftH = 0;
  let rightH = 0;
  for (const gif of results) {
    const ratio = gif.width > 0 ? gif.height / gif.width : 1;
    if (leftH <= rightH) {
      left.push(gif);
      leftH += ratio;
    } else {
      right.push(gif);
      rightH += ratio;
    }
  }

  return (
    <>
      <div className="shrink-0 border-b border-white/10 px-3 py-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search GIPHY"
          className="w-full rounded-md bg-surface-darkest px-3 py-1.5 text-sm text-white outline-none placeholder:text-gray-500 focus:ring-1 focus:ring-primary/50"
          autoFocus
        />
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-2"
        onScroll={handleScroll}
      >
        {results.length === 0 && !loading && (
          <p className="py-8 text-center text-sm text-gray-500">
            {query ? "No GIFs found" : "Loading..."}
          </p>
        )}

        <div className="flex gap-1.5">
          <div className="flex flex-1 flex-col gap-1.5">
            {left.map((gif) => (
              <GifThumb key={gif.id} gif={gif} onSelect={onSelect} onClose={onClose} />
            ))}
          </div>
          <div className="flex flex-1 flex-col gap-1.5">
            {right.map((gif) => (
              <GifThumb key={gif.id} gif={gif} onSelect={onSelect} onClose={onClose} />
            ))}
          </div>
        </div>

        {loading && (
          <div className="flex justify-center py-4">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-500 border-t-white" />
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-white/10 px-3 py-1.5">
        <p className="text-center text-[10px] text-gray-500">Powered by GIPHY</p>
      </div>
    </>
  );
}

function GifThumb({
  gif,
  onSelect,
  onClose,
}: {
  gif: GifResult;
  onSelect: (url: string) => void;
  onClose: () => void;
}) {
  return (
    <button
      type="button"
      className="block w-full overflow-hidden rounded-md transition hover:ring-2 hover:ring-primary"
      onClick={() => {
        onSelect(gif.url);
        onClose();
      }}
      title={gif.title}
    >
      <img
        src={gif.preview}
        alt={gif.title}
        className="w-full rounded-md object-cover"
        loading="lazy"
        style={{
          aspectRatio:
            gif.width > 0 && gif.height > 0
              ? `${gif.width}/${gif.height}`
              : undefined,
        }}
      />
    </button>
  );
}

function XIcon() {
  return (
    <svg
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path d="M6 18 18 6M6 6l12 12" />
    </svg>
  );
}
