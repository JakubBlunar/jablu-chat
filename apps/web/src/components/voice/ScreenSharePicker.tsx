import { useCallback, useEffect, useState } from "react";
import { publishScreenShare } from "./screenShareUtils";

type ScreenSource = {
  id: string;
  name: string;
  thumbnail: string;
  appIcon: string | null;
};

export function ScreenSharePicker() {
  const [sources, setSources] = useState<ScreenSource[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function handleEvent(e: Event) {
      const detail = (e as CustomEvent<{ sources: ScreenSource[] }>).detail;
      setSources(detail.sources);
      setOpen(true);
    }
    window.addEventListener("voice:pick-screen", handleEvent);
    return () => window.removeEventListener("voice:pick-screen", handleEvent);
  }, []);

  const handleSelect = useCallback((sourceId: string) => {
    setOpen(false);
    void publishScreenShare(sourceId);
  }, []);

  if (!open || sources.length === 0) return null;

  const screens = sources.filter((s) => s.id.startsWith("screen:"));
  const windows = sources.filter((s) => s.id.startsWith("window:"));

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-3xl rounded-lg bg-[#2b2d31] p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">
            Share Your Screen
          </h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded p-1 text-gray-400 transition hover:bg-white/10 hover:text-white"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z" />
            </svg>
          </button>
        </div>

        {screens.length > 0 && (
          <>
            <h3 className="mb-2 text-sm font-semibold uppercase text-gray-400">
              Screens
            </h3>
            <div className="mb-4 grid grid-cols-3 gap-3">
              {screens.map((s) => (
                <SourceCard key={s.id} source={s} onSelect={handleSelect} />
              ))}
            </div>
          </>
        )}

        {windows.length > 0 && (
          <>
            <h3 className="mb-2 text-sm font-semibold uppercase text-gray-400">
              Application Windows
            </h3>
            <div className="grid max-h-[300px] grid-cols-3 gap-3 overflow-y-auto">
              {windows.map((s) => (
                <SourceCard key={s.id} source={s} onSelect={handleSelect} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SourceCard({
  source,
  onSelect,
}: {
  source: ScreenSource;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(source.id)}
      className="group overflow-hidden rounded-lg border-2 border-transparent bg-[#1e1f22] transition hover:border-[#5865f2]"
    >
      <div className="aspect-video w-full overflow-hidden bg-black">
        <img
          src={source.thumbnail}
          alt={source.name}
          className="h-full w-full object-contain"
        />
      </div>
      <div className="flex items-center gap-2 px-2 py-1.5">
        {source.appIcon && (
          <img src={source.appIcon} alt="" className="h-4 w-4" />
        )}
        <span className="truncate text-xs text-gray-300 group-hover:text-white">
          {source.name}
        </span>
      </div>
    </button>
  );
}
