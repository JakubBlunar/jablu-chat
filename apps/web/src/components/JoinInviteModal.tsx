import { useState } from "react";
import { api } from "@/lib/api";
import { useServerStore } from "@/stores/server.store";

interface JoinInviteModalProps {
  onClose: () => void;
}

export function JoinInviteModal({ onClose }: JoinInviteModalProps) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchServers = useServerStore((s) => s.fetchServers);

  async function handleJoin() {
    const trimmed = code.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    try {
      await api.joinViaInvite(trimmed);
      await fetchServers();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to join");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-sm rounded-lg bg-[#313338] p-6 shadow-xl">
        <h2 className="mb-1 text-lg font-bold text-white">Join a Server</h2>
        <p className="mb-4 text-sm text-gray-400">
          Enter an invite code to join an existing server.
        </p>

        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Enter invite code"
          className="mb-3 w-full rounded bg-[#1e1f22] px-3 py-2.5 text-sm text-white outline-none placeholder:text-gray-500 focus:ring-2 focus:ring-[#5865f2]"
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleJoin();
          }}
          autoFocus
        />

        {error && (
          <p className="mb-3 text-sm text-red-400">{error}</p>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded px-4 py-2 text-sm text-gray-300 transition hover:text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={loading || !code.trim()}
            onClick={() => void handleJoin()}
            className="rounded bg-[#5865f2] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#4752c4] disabled:opacity-50"
          >
            {loading ? "Joining..." : "Join Server"}
          </button>
        </div>
      </div>
    </div>
  );
}
