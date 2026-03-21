import { useState } from "react";
import { useServerStore } from "@/stores/server.store";

type CreateServerModalProps = {
  open: boolean;
  onClose: () => void;
};

export function CreateServerModal({ open, onClose }: CreateServerModalProps) {
  const createServer = useServerStore((s) => s.createServer);
  const setCurrentServer = useServerStore((s) => s.setCurrentServer);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function handleCreate() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Enter a server name.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const server = await createServer(trimmed);
      setCurrentServer(server.id);
      setName("");
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm transition-opacity"
      role="presentation"
      onMouseDown={(ev) => {
        if (ev.target === ev.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-md rounded-lg bg-surface-dark p-6 shadow-2xl ring-1 ring-white/10 transition-transform"
        role="dialog"
        aria-labelledby="create-server-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2
          id="create-server-title"
          className="text-xl font-semibold text-white"
        >
          Create a Server
        </h2>
        <p className="mt-2 text-sm text-gray-400">
          Give your new server a name. You can change it later.
        </p>
        <label className="mt-5 block text-xs font-semibold uppercase tracking-wide text-gray-400">
          Server name
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My cool server"
            className="mt-1.5 w-full rounded-md border-0 bg-surface-darkest px-3 py-2.5 text-sm text-white outline-none ring-1 ring-white/10 transition placeholder:text-gray-500 focus:ring-2 focus:ring-primary"
            maxLength={100}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleCreate();
            }}
          />
        </label>
        {error ? (
          <p className="mt-2 text-sm text-red-400" role="alert">
            {error}
          </p>
        ) : null}
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setName("");
              setError(null);
              onClose();
            }}
            disabled={busy}
            className="rounded-md px-4 py-2 text-sm font-medium text-gray-300 transition hover:bg-white/5 hover:text-white disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={busy}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover disabled:opacity-50"
          >
            {busy ? "Creating…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
