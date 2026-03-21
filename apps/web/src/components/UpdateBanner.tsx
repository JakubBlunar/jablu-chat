import { useEffect, useState } from "react";
import { electronAPI, isElectron } from "@/lib/electron";

type UpdateState =
  | { status: "idle" }
  | { status: "available"; version: string }
  | { status: "downloading"; percent: number }
  | { status: "ready"; version: string }
  | { status: "error"; message: string };

export function UpdateBanner() {
  const [state, setState] = useState<UpdateState>({ status: "idle" });
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!isElectron || !electronAPI) return;

    const unsubs = [
      electronAPI.onUpdateAvailable((info) => {
        setState({ status: "available", version: info.version });
        setDismissed(false);
      }),
      electronAPI.onUpdateDownloadProgress((progress) => {
        setState({ status: "downloading", percent: progress.percent });
      }),
      electronAPI.onUpdateDownloaded((info) => {
        setState({ status: "ready", version: info.version });
        setDismissed(false);
      }),
      electronAPI.onUpdateError((err) => {
        setState({ status: "error", message: err.message });
      }),
    ];

    return () => unsubs.forEach((fn) => fn());
  }, []);

  if (!isElectron || dismissed || state.status === "idle") return null;

  if (state.status === "error") return null;

  return (
    <div className="flex items-center gap-3 bg-primary/90 px-4 py-2 text-sm text-white">
      {state.status === "available" && (
        <>
          <span>A new version ({state.version}) is being downloaded...</span>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="ml-auto text-xs text-white/70 hover:text-white"
          >
            Dismiss
          </button>
        </>
      )}
      {state.status === "downloading" && (
        <>
          <span>Downloading update... {state.percent.toFixed(0)}%</span>
          <div className="h-1.5 w-32 overflow-hidden rounded-full bg-white/30">
            <div
              className="h-full rounded-full bg-white transition-all"
              style={{ width: `${state.percent}%` }}
            />
          </div>
        </>
      )}
      {state.status === "ready" && (
        <>
          <span>Update {state.version} ready to install!</span>
          <button
            type="button"
            onClick={() => electronAPI?.installUpdate()}
            className="rounded-md bg-white/20 px-3 py-1 text-xs font-medium text-white transition hover:bg-white/30"
          >
            Restart & Update
          </button>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="ml-auto text-xs text-white/70 hover:text-white"
          >
            Later
          </button>
        </>
      )}
    </div>
  );
}
