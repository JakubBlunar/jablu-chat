import type { Channel } from "@chat/shared";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useChannelStore } from "@/stores/channel.store";
import { useServerStore } from "@/stores/server.store";

function normalizeChannelName(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function EditChannelModal({
  channel,
  onClose,
}: {
  channel: Channel;
  onClose: () => void;
}) {
  const currentServerId = useServerStore((s) => s.currentServerId);
  const fetchChannels = useChannelStore((s) => s.fetchChannels);
  const currentChannelId = useChannelStore((s) => s.currentChannelId);
  const setCurrentChannel = useChannelStore((s) => s.setCurrentChannel);

  const [rawName, setRawName] = useState(channel.name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const name = normalizeChannelName(rawName);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleSave = useCallback(async () => {
    if (!currentServerId || !name) return;
    if (name === channel.name) {
      onClose();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.updateChannel(currentServerId, channel.id, { name });
      await fetchChannels(currentServerId);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update channel.");
    } finally {
      setSaving(false);
    }
  }, [currentServerId, channel, name, fetchChannels, onClose]);

  const handleDelete = useCallback(async () => {
    if (!currentServerId) return;
    setDeleting(true);
    setError(null);
    try {
      await api.deleteChannel(currentServerId, channel.id);
      if (currentChannelId === channel.id) {
        setCurrentChannel(null);
      }
      await fetchChannels(currentServerId);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete channel.");
      setDeleting(false);
    }
  }, [
    currentServerId,
    channel.id,
    currentChannelId,
    setCurrentChannel,
    fetchChannels,
    onClose,
  ]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(ev) => {
        if (ev.target === ev.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-md rounded-lg bg-surface-dark p-6 shadow-2xl ring-1 ring-white/10"
        role="dialog"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-semibold text-white">Edit Channel</h2>
        <p className="mt-1 text-sm text-gray-400">
          #{channel.name} &middot;{" "}
          {channel.type === "text" ? "Text Channel" : "Voice Channel"}
        </p>

        <label className="mt-5 block text-xs font-semibold uppercase tracking-wide text-gray-400">
          Channel name
          <input
            type="text"
            value={rawName}
            onChange={(e) => setRawName(e.target.value)}
            className="mt-1.5 w-full rounded-md border-0 bg-surface-darkest px-3 py-2.5 text-sm text-white outline-none ring-1 ring-white/10 transition placeholder:text-gray-500 focus:ring-2 focus:ring-primary"
            maxLength={100}
            autoFocus
          />
        </label>
        {name && name !== channel.name ? (
          <p className="mt-1.5 text-xs text-gray-500">
            Will be renamed to <span className="text-gray-300">#{name}</span>
          </p>
        ) : null}

        {error && (
          <p className="mt-3 text-sm text-red-400" role="alert">
            {error}
          </p>
        )}

        <div className="mt-6 flex justify-between">
          <div>
            {!confirmDelete ? (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="rounded-md px-3 py-2 text-sm font-medium text-red-400 transition hover:bg-red-500/10"
              >
                Delete Channel
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-50"
                >
                  {deleting ? "Deleting…" : "Confirm Delete"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="rounded-md px-3 py-2 text-sm text-gray-400 hover:text-white"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-md px-4 py-2 text-sm font-medium text-gray-300 transition hover:bg-white/5 hover:text-white disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving || !name || name === channel.name}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
