import type { UserStatus } from "@chat/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { UserAvatar } from "@/components/UserAvatar";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth.store";
import type { Member } from "@/stores/member.store";
import { useMemberStore } from "@/stores/member.store";
import type { Server } from "@/stores/server.store";
import { useServerStore } from "@/stores/server.store";

type Tab = "overview" | "members" | "danger";

export function ServerSettingsModal({
  server,
  onClose,
}: {
  server: Server;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("overview");

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="flex h-[80vh] w-[720px] max-w-[95vw] overflow-hidden rounded-lg bg-[#313338] shadow-xl">
        <nav className="flex w-44 shrink-0 flex-col gap-0.5 bg-[#2b2d31] p-3">
          <h2 className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            Server Settings
          </h2>
          {(
            [
              ["overview", "Overview"],
              ["members", "Members"],
              ["danger", "Danger Zone"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`rounded-md px-2 py-1.5 text-left text-sm transition ${
                tab === id
                  ? "bg-[#404249] text-white"
                  : "text-gray-300 hover:bg-white/[0.06] hover:text-white"
              }`}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
            <h1 className="text-lg font-semibold text-white">
              {tab === "overview" && "Server Overview"}
              {tab === "members" && "Members"}
              {tab === "danger" && "Danger Zone"}
            </h1>
            <button
              type="button"
              onClick={onClose}
              className="rounded p-1 text-gray-400 transition hover:text-white"
            >
              <XIcon />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            {tab === "overview" && <OverviewTab server={server} />}
            {tab === "members" && <MembersTab server={server} />}
            {tab === "danger" && (
              <DangerTab server={server} onClose={onClose} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function OverviewTab({ server }: { server: Server }) {
  const [name, setName] = useState(server.name);
  const [saving, setSaving] = useState(false);
  const [iconPreview, setIconPreview] = useState<string | null>(
    server.iconUrl,
  );
  const fileRef = useRef<HTMLInputElement>(null);
  const updateServerInList = useServerStore((s) => s.updateServerInList);

  const saveName = useCallback(async () => {
    if (!name.trim() || name === server.name) return;
    setSaving(true);
    try {
      await api.updateServer(server.id, { name: name.trim() });
      updateServerInList(server.id, { name: name.trim() });
    } finally {
      setSaving(false);
    }
  }, [name, server, updateServerInList]);

  const handleIconChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const preview = URL.createObjectURL(file);
      setIconPreview(preview);
      try {
        const updated = (await api.uploadServerIcon(server.id, file)) as {
          iconUrl: string;
        };
        updateServerInList(server.id, { iconUrl: updated.iconUrl });
        setIconPreview(updated.iconUrl);
      } catch {
        setIconPreview(server.iconUrl);
      }
    },
    [server, updateServerInList],
  );

  const removeIcon = useCallback(async () => {
    try {
      await api.deleteServerIcon(server.id);
      updateServerInList(server.id, { iconUrl: null });
      setIconPreview(null);
    } catch {
      /* ignore */
    }
  }, [server.id, updateServerInList]);

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-6">
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="group relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-[#5865f2] text-3xl font-bold text-white transition hover:opacity-80"
          >
            {iconPreview ? (
              <img
                src={iconPreview}
                alt="Server icon"
                className="h-full w-full object-cover"
              />
            ) : (
              server.name.charAt(0).toUpperCase()
            )}
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition group-hover:opacity-100">
              <CameraIcon />
            </div>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleIconChange}
          />
          {iconPreview && (
            <button
              type="button"
              onClick={removeIcon}
              className="text-xs text-red-400 hover:underline"
            >
              Remove
            </button>
          )}
        </div>

        <div className="flex-1 space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            Server Name
          </label>
          <div className="flex gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              className="flex-1 rounded-md border border-white/10 bg-[#1e1f22] px-3 py-2 text-sm text-white outline-none focus:border-[#5865f2]"
            />
            <button
              type="button"
              disabled={saving || !name.trim() || name === server.name}
              onClick={saveName}
              className="rounded-md bg-[#5865f2] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#4752c4] disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MembersTab({ server }: { server: Server }) {
  const currentUser = useAuthStore((s) => s.user);
  const members = useMemberStore((s) => s.members);
  const onlineIds = useMemberStore((s) => s.onlineUserIds);
  const fetchMembers = useMemberStore((s) => s.fetchMembers);
  const isOwner = currentUser?.id === server.ownerId;

  useEffect(() => {
    fetchMembers(server.id);
  }, [server.id, fetchMembers]);

  const handleRoleChange = useCallback(
    async (member: Member, newRole: string) => {
      await api.updateMemberRole(server.id, member.userId, newRole);
      fetchMembers(server.id);
    },
    [server.id, fetchMembers],
  );

  const handleKick = useCallback(
    async (member: Member) => {
      if (
        !confirm(
          `Kick ${member.user.username} from the server?`,
        )
      )
        return;
      await api.kickMember(server.id, member.userId);
      fetchMembers(server.id);
    },
    [server.id, fetchMembers],
  );

  return (
    <div className="space-y-1">
      {members.map((m) => {
        const presence: UserStatus = onlineIds.has(m.userId)
          ? ((m.user.status as UserStatus) ?? "online")
          : "offline";
        const isSelf = m.userId === currentUser?.id;
        const isMemberOwner = m.role === "owner";

        return (
          <div
            key={m.userId}
            className="flex items-center gap-3 rounded-md px-3 py-2 hover:bg-white/[0.04]"
          >
            <UserAvatar
              username={m.user.username}
              avatarUrl={m.user.avatarUrl}
              size="md"
              showStatus
              status={presence}
            />
            <div className="min-w-0 flex-1">
              <span className="text-sm font-medium text-white">
                {m.user.username}
              </span>
              {m.role !== "member" && (
                <span className="ml-2 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#5865f2] ring-1 ring-[#5865f2]/40">
                  {m.role}
                </span>
              )}
            </div>

            {isOwner && !isSelf && !isMemberOwner && (
              <div className="flex items-center gap-2">
                <select
                  value={m.role}
                  onChange={(e) => handleRoleChange(m, e.target.value)}
                  className="rounded border border-white/10 bg-[#1e1f22] px-2 py-1 text-xs text-white outline-none"
                >
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </select>
                <button
                  type="button"
                  onClick={() => handleKick(m)}
                  title="Kick member"
                  className="rounded p-1 text-red-400 transition hover:bg-red-500/20"
                >
                  <KickIcon />
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function DangerTab({
  server,
  onClose,
}: {
  server: Server;
  onClose: () => void;
}) {
  const currentUser = useAuthStore((s) => s.user);
  const removeServer = useServerStore((s) => s.removeServer);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const isOwner = currentUser?.id === server.ownerId;

  const handleDelete = useCallback(async () => {
    if (confirmText !== server.name) return;
    setDeleting(true);
    try {
      await api.deleteServer(server.id);
      removeServer(server.id);
      onClose();
    } catch {
      setDeleting(false);
    }
  }, [confirmText, server, removeServer, onClose]);

  if (!isOwner) {
    return (
      <p className="text-sm text-gray-400">
        Only the server owner can delete this server.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-red-500/40 bg-red-500/10 p-4">
        <h3 className="text-sm font-semibold text-red-400">
          Delete Server
        </h3>
        <p className="mt-1 text-sm text-gray-300">
          This will permanently delete{" "}
          <strong className="text-white">{server.name}</strong>, all channels,
          messages, and uploaded files. This action cannot be undone.
        </p>
        <div className="mt-4 space-y-2">
          <label className="text-xs text-gray-400">
            Type <strong className="text-white">{server.name}</strong> to
            confirm
          </label>
          <input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={server.name}
            className="w-full rounded-md border border-white/10 bg-[#1e1f22] px-3 py-2 text-sm text-white outline-none focus:border-red-500"
          />
          <button
            type="button"
            disabled={confirmText !== server.name || deleting}
            onClick={handleDelete}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-50"
          >
            {deleting ? "Deleting…" : "Delete Server"}
          </button>
        </div>
      </div>
    </div>
  );
}

function XIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.3 5.71a1 1 0 00-1.42 0L12 10.59 7.12 5.71A1 1 0 105.7 7.12L10.59 12l-4.88 4.88a1 1 0 101.42 1.42L12 13.41l4.88 4.88a1 1 0 001.42-1.42L13.41 12l4.88-4.88a1 1 0 000-1.41z" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 15.2a3.2 3.2 0 100-6.4 3.2 3.2 0 000 6.4z" />
      <path d="M9 2l-1.83 2H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V6a2 2 0 00-2-2h-3.17L15 2H9zm3 15a5 5 0 110-10 5 5 0 010 10z" />
    </svg>
  );
}

function KickIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <circle cx="8.5" cy="7" r="4" />
      <line x1="18" y1="8" x2="23" y2="13" />
      <line x1="23" y1="8" x2="18" y2="13" />
    </svg>
  );
}
