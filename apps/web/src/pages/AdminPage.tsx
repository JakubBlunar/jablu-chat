import { useCallback, useEffect, useState } from "react";

const ADMIN_STORAGE_KEY = "chat-admin-password";

type AdminServer = {
  id: string;
  name: string;
  iconUrl: string | null;
  ownerId: string;
  createdAt: string;
  owner: { id: string; username: string };
  _count: { members: number; channels: number };
};

type AdminUser = {
  id: string;
  username: string;
  email: string;
  bio: string | null;
  avatarUrl: string | null;
  status: string;
  createdAt: string;
  _count: { serverMemberships: number; messages: number };
};

type AdminInvite = {
  id: string;
  code: string;
  email: string;
  used: boolean;
  usedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  server: { id: string; name: string } | null;
  usedBy: { id: string; username: string } | null;
};

type StorageAudit = {
  id: string;
  status: string;
  totalSizeBytes: string;
  limitBytes: string;
  orphanedCount: number;
  orphanedBytes: string;
  attachmentCount: number;
  attachmentBytes: string;
  messageCount: number;
  messageBytes: string;
  diskOrphanCount: number;
  diskOrphanBytes: string;
  totalFreeable: string;
  executedAt: string | null;
  freedBytes: string | null;
  createdAt: string;
};

type StorageStats = {
  dirSize: {
    avatars: number;
    attachments: number;
    thumbnails: number;
    other: number;
    total: number;
  };
  limitBytes: number;
  attachmentCount: number;
  messageCount: number;
  orphanedAttachments: number;
};

type Tab = "servers" | "users" | "invites" | "storage";

function getStoredPassword(): string {
  return sessionStorage.getItem(ADMIN_STORAGE_KEY) ?? "";
}

function setStoredPassword(pw: string) {
  sessionStorage.setItem(ADMIN_STORAGE_KEY, pw);
}

async function adminFetch<T>(
  path: string,
  opts?: { method?: string; body?: unknown },
): Promise<T> {
  const password = getStoredPassword();
  const res = await fetch(path, {
    method: opts?.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      "x-admin-password": password,
    },
    body: opts?.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.message ?? res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ─── Login ────────────────────────────────────────────────

function AdminLogin({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = (await res.json()) as { ok: boolean };
      if (data.ok) {
        setStoredPassword(password);
        onLogin();
      } else {
        setError("Invalid password");
      }
    } catch {
      setError("Connection failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-darkest p-4">
      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="w-full max-w-sm rounded-lg bg-surface-dark p-8 shadow-2xl ring-1 ring-white/10"
      >
        <h1 className="text-2xl font-bold text-white">Admin Panel</h1>
        <p className="mt-2 text-sm text-gray-400">
          Enter the superadmin password to continue.
        </p>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          autoFocus
          className="mt-5 w-full rounded-md bg-surface-darkest px-3 py-2.5 text-sm text-white outline-none ring-1 ring-white/10 placeholder:text-gray-500 focus:ring-2 focus:ring-primary"
        />
        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={busy || !password}
          className="mt-4 w-full rounded-md bg-primary py-2.5 text-sm font-medium text-white transition hover:bg-primary-hover disabled:opacity-50"
        >
          {busy ? "Checking…" : "Login"}
        </button>
      </form>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────

function AdminDashboard() {
  const [tab, setTab] = useState<Tab>("servers");
  const [servers, setServers] = useState<AdminServer[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [invites, setInvites] = useState<AdminInvite[]>([]);
  const [regMode, setRegMode] = useState("open");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchAll = useCallback(async () => {
    setError("");
    try {
      const [s, u, inv, settings] = await Promise.all([
        adminFetch<AdminServer[]>("/api/admin/servers"),
        adminFetch<AdminUser[]>("/api/admin/users"),
        adminFetch<AdminInvite[]>("/api/admin/invites"),
        adminFetch<{ mode: string }>("/api/admin/settings/registration"),
      ]);
      setServers(s);
      setUsers(u);
      setInvites(inv);
      setRegMode(settings.mode);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load";
      if (msg.includes("Unauthorized") || msg.includes("admin password")) {
        sessionStorage.removeItem(ADMIN_STORAGE_KEY);
        window.location.reload();
        return;
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-darkest">
        <div className="text-gray-400">Loading…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-darkest p-6 text-white">
      <div className="mx-auto max-w-5xl">
        {error && (
          <div className="mb-4 rounded-md bg-red-900/30 px-4 py-3 text-sm text-red-300 ring-1 ring-red-500/30">
            {error}
            <button type="button" onClick={() => void fetchAll()} className="ml-2 underline hover:text-white">Retry</button>
          </div>
        )}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Admin Panel</h1>
          <button
            type="button"
            onClick={() => {
              sessionStorage.removeItem(ADMIN_STORAGE_KEY);
              window.location.reload();
            }}
            className="rounded-md px-4 py-2 text-sm font-medium text-gray-400 transition hover:bg-white/5 hover:text-white"
          >
            Logout
          </button>
        </div>

        <div className="mt-4 flex gap-1 border-b border-white/10">
          {(["servers", "users", "invites", "storage"] as const).map((t) => {
            let label = t as string;
            if (t === "servers") label = `Servers (${servers.length})`;
            else if (t === "users") label = `Users (${users.length})`;
            else if (t === "invites") label = `Invites (${invites.length})`;
            else if (t === "storage") label = "Storage";
            return (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`rounded-t-md px-4 py-2.5 text-sm font-medium capitalize transition ${
                  tab === t
                    ? "bg-surface-dark text-white"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div className="mt-4">
          {tab === "servers" && (
            <ServersTab
              servers={servers}
              setServers={setServers}
              users={users}
            />
          )}
          {tab === "users" && (
            <UsersTab users={users} setUsers={setUsers} />
          )}
          {tab === "invites" && (
            <InvitesTab
              invites={invites}
              setInvites={setInvites}
              servers={servers}
              regMode={regMode}
            />
          )}
          {tab === "storage" && <StorageTab />}
        </div>
      </div>
    </div>
  );
}

// ─── Servers Tab ──────────────────────────────────────────

function ServersTab({
  servers,
  setServers,
  users,
}: {
  servers: AdminServer[];
  setServers: React.Dispatch<React.SetStateAction<AdminServer[]>>;
  users: AdminUser[];
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newOwnerId, setNewOwnerId] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!newName.trim() || !newOwnerId) return;
    setCreating(true);
    setCreateError("");
    try {
      const server = await adminFetch<AdminServer>("/api/admin/servers", {
        method: "POST",
        body: { name: newName.trim(), ownerUserId: newOwnerId },
      });
      setServers((prev) => [server, ...prev]);
      setNewName("");
      setNewOwnerId("");
      setShowCreate(false);
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Failed");
    } finally {
      setCreating(false);
    }
  };

  const [deleteError, setDeleteError] = useState("");

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    setDeleteError("");
    try {
      await adminFetch(`/api/admin/servers/${id}`, { method: "DELETE" });
      setServers((prev) => prev.filter((s) => s.id !== id));
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  };

  return (
    <>
      {deleteError && (
        <div className="mb-3 rounded-md bg-red-900/30 px-4 py-2 text-sm text-red-300 ring-1 ring-red-500/30">
          {deleteError}
        </div>
      )}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setShowCreate(!showCreate)}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium transition hover:bg-primary-hover"
        >
          {showCreate ? "Cancel" : "Create Server"}
        </button>
      </div>

      {showCreate && (
        <div className="mt-4 rounded-lg bg-surface-dark p-5 ring-1 ring-white/10">
          <h2 className="text-lg font-semibold">Create New Server</h2>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Server name"
              className="flex-1 rounded-md bg-surface-darkest px-3 py-2 text-sm outline-none ring-1 ring-white/10 placeholder:text-gray-500 focus:ring-2 focus:ring-primary"
            />
            <select
              value={newOwnerId}
              onChange={(e) => setNewOwnerId(e.target.value)}
              className="rounded-md bg-surface-darkest px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-primary"
            >
              <option value="">Select owner…</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.username} ({u.email})
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void handleCreate()}
              disabled={creating || !newName.trim() || !newOwnerId}
              className="rounded-md bg-success px-4 py-2 text-sm font-medium text-white transition hover:bg-success-hover disabled:opacity-50"
            >
              {creating ? "Creating…" : "Create"}
            </button>
          </div>
          {createError && (
            <p className="mt-2 text-sm text-red-400">{createError}</p>
          )}
        </div>
      )}

      <div className="mt-4 space-y-2">
        {servers.length === 0 ? (
          <Empty>No servers yet.</Empty>
        ) : (
          servers.map((server) => (
            <div
              key={server.id}
              className="flex items-center gap-4 rounded-lg bg-surface-dark p-4 ring-1 ring-white/10"
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-surface text-lg font-semibold">
                {server.iconUrl ? (
                  <img
                    src={server.iconUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  server.name.charAt(0).toUpperCase()
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{server.name}</p>
                <p className="text-sm text-gray-400">
                  Owner: {server.owner.username} &middot;{" "}
                  {server._count.members} member
                  {server._count.members !== 1 && "s"} &middot;{" "}
                  {server._count.channels} channel
                  {server._count.channels !== 1 && "s"}
                </p>
                <p className="text-xs text-gray-500">
                  Created{" "}
                  {fmtDate(server.createdAt)}
                </p>
              </div>
              <ConfirmDeleteBtn
                id={server.id}
                confirmId={confirmDeleteId}
                deletingId={deletingId}
                onConfirm={() => setConfirmDeleteId(server.id)}
                onCancel={() => setConfirmDeleteId(null)}
                onDelete={() => void handleDelete(server.id)}
              />
            </div>
          ))
        )}
      </div>
    </>
  );
}

// ─── Users Tab ────────────────────────────────────────────

function UsersTab({
  users,
  setUsers,
}: {
  users: AdminUser[];
  setUsers: React.Dispatch<React.SetStateAction<AdminUser[]>>;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    username: "",
    email: "",
    bio: "",
  });
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState("");

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const startEdit = (user: AdminUser) => {
    setEditingId(user.id);
    setEditForm({
      username: user.username,
      email: user.email,
      bio: user.bio ?? "",
    });
    setEditError("");
  };

  const handleSave = async () => {
    if (!editingId) return;
    setSaving(true);
    setEditError("");
    try {
      const updated = await adminFetch<AdminUser>(
        `/api/admin/users/${editingId}`,
        {
          method: "PATCH",
          body: {
            username: editForm.username.trim(),
            email: editForm.email.trim(),
            bio: editForm.bio.trim(),
          },
        },
      );
      setUsers((prev) => prev.map((u) => (u.id === editingId ? updated : u)));
      setEditingId(null);
    } catch (e) {
      setEditError(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  const [deleteError, setDeleteError] = useState("");

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    setDeleteError("");
    try {
      await adminFetch(`/api/admin/users/${id}`, { method: "DELETE" });
      setUsers((prev) => prev.filter((u) => u.id !== id));
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  };

  return (
    <div className="space-y-2">
      {deleteError && (
        <div className="mb-3 rounded-md bg-red-900/30 px-4 py-2 text-sm text-red-300 ring-1 ring-red-500/30">
          {deleteError}
        </div>
      )}
      {users.length === 0 ? (
        <Empty>No users registered.</Empty>
      ) : (
        users.map((user) => (
          <div
            key={user.id}
            className="rounded-lg bg-surface-dark ring-1 ring-white/10"
          >
            <div className="flex items-center gap-4 p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary text-sm font-bold uppercase text-white">
                {user.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  user.username.charAt(0)
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate font-semibold">{user.username}</p>
                  <span
                    className={`inline-block h-2 w-2 rounded-full ${
                      user.status === "online"
                        ? "bg-green-500"
                        : user.status === "idle"
                          ? "bg-yellow-500"
                          : user.status === "dnd"
                            ? "bg-red-500"
                            : "bg-gray-500"
                    }`}
                    title={user.status}
                  />
                </div>
                <p className="truncate text-sm text-gray-400">{user.email}</p>
                <p className="text-xs text-gray-500">
                  {user._count.serverMemberships} server
                  {user._count.serverMemberships !== 1 && "s"} &middot;{" "}
                  {user._count.messages} message
                  {user._count.messages !== 1 && "s"} &middot; Joined{" "}
                  {fmtDate(user.createdAt)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    editingId === user.id
                      ? setEditingId(null)
                      : startEdit(user)
                  }
                  className="rounded-md px-3 py-1.5 text-sm font-medium text-gray-300 transition hover:bg-white/5 hover:text-white"
                >
                  {editingId === user.id ? "Cancel" : "Edit"}
                </button>
                <ConfirmDeleteBtn
                  id={user.id}
                  confirmId={confirmDeleteId}
                  deletingId={deletingId}
                  onConfirm={() => setConfirmDeleteId(user.id)}
                  onCancel={() => setConfirmDeleteId(null)}
                  onDelete={() => void handleDelete(user.id)}
                  label="Delete User"
                />
              </div>
            </div>

            {editingId === user.id && (
              <div className="border-t border-white/5 p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                      Username
                    </span>
                    <input
                      type="text"
                      value={editForm.username}
                      onChange={(e) =>
                        setEditForm((f) => ({
                          ...f,
                          username: e.target.value,
                        }))
                      }
                      className="mt-1 w-full rounded-md bg-surface-darkest px-3 py-2 text-sm text-white outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-primary"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                      Email
                    </span>
                    <input
                      type="email"
                      value={editForm.email}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, email: e.target.value }))
                      }
                      className="mt-1 w-full rounded-md bg-surface-darkest px-3 py-2 text-sm text-white outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-primary"
                    />
                  </label>
                </div>
                <label className="mt-3 block">
                  <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                    Bio
                  </span>
                  <textarea
                    value={editForm.bio}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, bio: e.target.value }))
                    }
                    rows={2}
                    className="mt-1 w-full resize-none rounded-md bg-surface-darkest px-3 py-2 text-sm text-white outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-primary"
                  />
                </label>
                {editError && (
                  <p className="mt-2 text-sm text-red-400">{editError}</p>
                )}
                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    onClick={() => void handleSave()}
                    disabled={saving || !editForm.username.trim() || !editForm.email.trim()}
                    className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover disabled:opacity-50"
                  >
                    {saving ? "Saving…" : "Save Changes"}
                  </button>
                </div>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}

// ─── Invites Tab ──────────────────────────────────────────

function InvitesTab({
  invites,
  setInvites,
  servers,
  regMode,
}: {
  invites: AdminInvite[];
  setInvites: React.Dispatch<React.SetStateAction<AdminInvite[]>>;
  servers: AdminServer[];
  regMode: string;
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newServerId, setNewServerId] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState("");

  const handleCreate = async () => {
    if (!newEmail.trim()) return;
    setCreating(true);
    setCreateError("");
    try {
      const invite = await adminFetch<AdminInvite>("/api/admin/invites", {
        method: "POST",
        body: {
          email: newEmail.trim(),
          ...(newServerId ? { serverId: newServerId } : {}),
        },
      });
      setInvites((prev) => [invite, ...prev]);
      setNewEmail("");
      setNewServerId("");
      setShowCreate(false);
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Failed");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    setDeleteError("");
    try {
      await adminFetch(`/api/admin/invites/${id}`, { method: "DELETE" });
      setInvites((prev) => prev.filter((i) => i.id !== id));
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  };

  return (
    <>
      <div className={`mb-4 rounded-md px-4 py-3 text-sm ring-1 ${
        regMode === "invite"
          ? "bg-emerald-900/20 text-emerald-300 ring-emerald-500/30"
          : "bg-amber-900/20 text-amber-300 ring-amber-500/30"
      }`}>
        Registration mode: <strong className="font-semibold">{regMode}</strong>
        {regMode === "open" && (
          <span className="ml-1 text-amber-400/80">
            — Anyone can register without an invite code. Set <code className="rounded bg-black/30 px-1 py-0.5 text-xs">REGISTRATION_MODE=invite</code> in your <code className="rounded bg-black/30 px-1 py-0.5 text-xs">.env</code> to require invites.
          </span>
        )}
        {regMode === "invite" && (
          <span className="ml-1 text-emerald-400/80">
            — Only users with a valid invite code can register.
          </span>
        )}
      </div>

      {deleteError && (
        <div className="mb-3 rounded-md bg-red-900/30 px-4 py-2 text-sm text-red-300 ring-1 ring-red-500/30">
          {deleteError}
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setShowCreate(!showCreate)}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium transition hover:bg-primary-hover"
        >
          {showCreate ? "Cancel" : "Create Invite"}
        </button>
      </div>

      {showCreate && (
        <div className="mt-4 rounded-lg bg-surface-dark p-5 ring-1 ring-white/10">
          <h2 className="text-lg font-semibold">Create Registration Invite</h2>
          <p className="mt-1 text-sm text-gray-400">
            The invite code will be tied to the email address. The user must register with this exact email.
          </p>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="user@example.com"
              className="flex-1 rounded-md bg-surface-darkest px-3 py-2 text-sm outline-none ring-1 ring-white/10 placeholder:text-gray-500 focus:ring-2 focus:ring-primary"
            />
            <select
              value={newServerId}
              onChange={(e) => setNewServerId(e.target.value)}
              className="rounded-md bg-surface-darkest px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-primary"
            >
              <option value="">No auto-join server</option>
              {servers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void handleCreate()}
              disabled={creating || !newEmail.trim()}
              className="rounded-md bg-success px-4 py-2 text-sm font-medium text-white transition hover:bg-success-hover disabled:opacity-50"
            >
              {creating ? "Creating…" : "Create"}
            </button>
          </div>
          {createError && (
            <p className="mt-2 text-sm text-red-400">{createError}</p>
          )}
        </div>
      )}

      <div className="mt-4 space-y-2">
        {invites.length === 0 ? (
          <Empty>No invites created yet.</Empty>
        ) : (
          invites.map((invite) => (
            <div
              key={invite.id}
              className="flex items-center gap-4 rounded-lg bg-surface-dark p-4 ring-1 ring-white/10"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-3">
                  <code className="rounded bg-surface-darkest px-2.5 py-1 font-mono text-sm font-semibold tracking-widest text-white">
                    {invite.code}
                  </code>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    invite.used
                      ? "bg-gray-600/30 text-gray-400"
                      : "bg-emerald-600/20 text-emerald-400"
                  }`}>
                    {invite.used ? "Used" : "Available"}
                  </span>
                </div>
                <p className="mt-1.5 text-sm text-gray-400">
                  Email: <span className="text-gray-300">{invite.email}</span>
                  {invite.server && (
                    <> &middot; Auto-join: <span className="text-gray-300">{invite.server.name}</span></>
                  )}
                </p>
                <p className="text-xs text-gray-500">
                  Created {fmtDate(invite.createdAt)}
                  {invite.used && invite.usedBy && (
                    <> &middot; Used by <span className="text-gray-400">{invite.usedBy.username}</span> on {fmtDate(invite.usedAt!)}</>
                  )}
                </p>
              </div>
              {!invite.used && (
                <ConfirmDeleteBtn
                  id={invite.id}
                  confirmId={confirmDeleteId}
                  deletingId={deletingId}
                  onConfirm={() => setConfirmDeleteId(invite.id)}
                  onCancel={() => setConfirmDeleteId(null)}
                  onDelete={() => void handleDelete(invite.id)}
                  label="Revoke"
                />
              )}
            </div>
          ))
        )}
      </div>
    </>
  );
}

// ─── Storage Tab ──────────────────────────────────────────

function StorageTab() {
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [audits, setAudits] = useState<StorageAudit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [auditing, setAuditing] = useState(false);
  const [cleaningId, setCleaningId] = useState<string | null>(null);
  const [confirmCleanupId, setConfirmCleanupId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [s, a] = await Promise.all([
        adminFetch<StorageStats>("/api/admin/storage"),
        adminFetch<StorageAudit[]>("/api/admin/storage/audits"),
      ]);
      setStats(s);
      setAudits(a);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handleRunAudit = async () => {
    setAuditing(true);
    setError("");
    try {
      const audit = await adminFetch<StorageAudit>("/api/admin/storage/audit", {
        method: "POST",
      });
      setAudits((prev) => [audit, ...prev.filter((a) => a.id !== audit.id)]);
      const s = await adminFetch<StorageStats>("/api/admin/storage");
      setStats(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Audit failed");
    } finally {
      setAuditing(false);
    }
  };

  const handleCleanup = async (auditId: string) => {
    setCleaningId(auditId);
    setError("");
    try {
      const updated = await adminFetch<StorageAudit>(
        `/api/admin/storage/cleanup/${auditId}`,
        { method: "POST" },
      );
      setAudits((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      const s = await adminFetch<StorageStats>("/api/admin/storage");
      setStats(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cleanup failed");
    } finally {
      setCleaningId(null);
      setConfirmCleanupId(null);
    }
  };

  const handleDeleteAudit = async (id: string) => {
    try {
      await adminFetch(`/api/admin/storage/audits/${id}`, { method: "DELETE" });
      setAudits((prev) => prev.filter((a) => a.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  };

  if (loading) {
    return (
      <div className="py-12 text-center text-gray-400">Loading storage info…</div>
    );
  }

  const usagePercent = stats
    ? Math.min(100, (stats.dirSize.total / stats.limitBytes) * 100)
    : 0;
  const usageColor =
    usagePercent > 90
      ? "bg-red-500"
      : usagePercent > 70
        ? "bg-amber-500"
        : "bg-emerald-500";

  const latestCompleted = audits.find((a) => a.status === "completed");

  return (
    <>
      {error && (
        <div className="mb-4 rounded-md bg-red-900/30 px-4 py-3 text-sm text-red-300 ring-1 ring-red-500/30">
          {error}
        </div>
      )}

      {/* Live Stats */}
      {stats && (
        <div className="rounded-lg bg-surface-dark p-5 ring-1 ring-white/10">
          <h2 className="text-lg font-semibold">Storage Usage</h2>

          <div className="mt-3">
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-gray-300">
                {fmtBytes(stats.dirSize.total)} / {fmtBytes(stats.limitBytes)}
              </span>
              <span className="text-gray-400">{usagePercent.toFixed(1)}%</span>
            </div>
            <div className="mt-1.5 h-3 w-full overflow-hidden rounded-full bg-surface-darkest">
              <div
                className={`h-full rounded-full transition-all ${usageColor}`}
                style={{ width: `${usagePercent}%` }}
              />
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Avatars" value={fmtBytes(stats.dirSize.avatars)} />
            <StatCard label="Attachments" value={fmtBytes(stats.dirSize.attachments)} />
            <StatCard label="Thumbnails" value={fmtBytes(stats.dirSize.thumbnails)} />
            <StatCard label="Other" value={fmtBytes(stats.dirSize.other)} />
          </div>

          <div className="mt-3 grid grid-cols-3 gap-3">
            <StatCard label="Total Attachments" value={stats.attachmentCount.toLocaleString()} />
            <StatCard label="Total Messages" value={stats.messageCount.toLocaleString()} />
            <StatCard label="Orphaned Attachments" value={stats.orphanedAttachments.toLocaleString()} />
          </div>
        </div>
      )}

      {/* Audit Controls */}
      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={() => void handleRunAudit()}
          disabled={auditing}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium transition hover:bg-primary-hover disabled:opacity-50"
        >
          {auditing ? "Running Audit…" : "Run Audit"}
        </button>
        {auditing && (
          <span className="text-sm text-gray-400">Scanning storage, this may take a moment…</span>
        )}
      </div>

      {/* Latest Completed Audit */}
      {latestCompleted && (
        <div className="mt-4 rounded-lg bg-surface-dark p-5 ring-1 ring-white/10">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Latest Audit Report</h3>
            <span className="rounded-full bg-emerald-600/20 px-2.5 py-0.5 text-xs font-medium text-emerald-400">
              Ready for cleanup
            </span>
          </div>
          <p className="mt-1 text-xs text-gray-500">
            Scanned on {fmtDate(latestCompleted.createdAt)}
          </p>

          <div className="mt-3 space-y-2">
            <AuditRow
              label="Orphaned uploads"
              count={latestCompleted.orphanedCount}
              bytes={latestCompleted.orphanedBytes}
            />
            <AuditRow
              label="Disk orphans"
              count={latestCompleted.diskOrphanCount}
              bytes={latestCompleted.diskOrphanBytes}
            />
            <AuditRow
              label="Old attachments"
              count={latestCompleted.attachmentCount}
              bytes={latestCompleted.attachmentBytes}
            />
            <AuditRow
              label="Old messages"
              count={latestCompleted.messageCount}
              bytes={latestCompleted.messageBytes}
            />
            <div className="border-t border-white/10 pt-2">
              <div className="flex items-baseline justify-between">
                <span className="font-semibold text-white">Total freeable</span>
                <span className="text-lg font-bold text-emerald-400">
                  {fmtBytes(Number(latestCompleted.totalFreeable))}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-4">
            {confirmCleanupId === latestCompleted.id ? (
              <div className="flex items-center gap-3 rounded-md bg-red-900/20 p-3 ring-1 ring-red-500/30">
                <span className="text-sm text-red-300">
                  This will permanently delete files. Continue?
                </span>
                <button
                  type="button"
                  onClick={() => void handleCleanup(latestCompleted.id)}
                  disabled={cleaningId === latestCompleted.id}
                  className="rounded-md bg-red-600 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-50"
                >
                  {cleaningId === latestCompleted.id ? "Cleaning…" : "Confirm Cleanup"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmCleanupId(null)}
                  className="text-sm text-gray-400 hover:text-white"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmCleanupId(latestCompleted.id)}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700"
              >
                Execute Cleanup
              </button>
            )}
          </div>
        </div>
      )}

      {/* Audit History */}
      {audits.length > 0 && (
        <div className="mt-4">
          <h3 className="text-lg font-semibold">Audit History</h3>
          <div className="mt-2 overflow-hidden rounded-lg ring-1 ring-white/10">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-dark text-xs uppercase text-gray-400">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Storage Used</th>
                  <th className="px-4 py-3">Freeable</th>
                  <th className="px-4 py-3">Freed</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {audits.map((audit) => (
                  <tr key={audit.id} className="bg-surface-dark/50">
                    <td className="whitespace-nowrap px-4 py-3 text-gray-300">
                      {fmtDate(audit.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <AuditStatusBadge status={audit.status} />
                    </td>
                    <td className="px-4 py-3 text-gray-300">
                      {fmtBytes(Number(audit.totalSizeBytes))}
                    </td>
                    <td className="px-4 py-3 text-gray-300">
                      {fmtBytes(Number(audit.totalFreeable))}
                    </td>
                    <td className="px-4 py-3 text-gray-300">
                      {audit.freedBytes ? fmtBytes(Number(audit.freedBytes)) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => void handleDeleteAudit(audit.id)}
                        className="text-xs text-gray-500 transition hover:text-red-400"
                      >
                        Dismiss
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-surface-darkest p-3">
      <p className="text-xs text-gray-400">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-white">{value}</p>
    </div>
  );
}

function AuditRow({
  label,
  count,
  bytes,
}: {
  label: string;
  count: number;
  bytes: string;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-gray-400">
        {label}{" "}
        <span className="text-gray-500">({count.toLocaleString()} items)</span>
      </span>
      <span className="font-medium text-gray-300">{fmtBytes(Number(bytes))}</span>
    </div>
  );
}

function AuditStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: "bg-gray-600/30 text-gray-400",
    completed: "bg-emerald-600/20 text-emerald-400",
    executing: "bg-amber-600/20 text-amber-400",
    executed: "bg-blue-600/20 text-blue-400",
    failed: "bg-red-600/20 text-red-400",
  };
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[status] ?? styles.pending}`}
    >
      {status}
    </span>
  );
}

function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

// ─── Shared Components ────────────────────────────────────

function ConfirmDeleteBtn({
  id,
  confirmId,
  deletingId,
  onConfirm,
  onCancel,
  onDelete,
  label = "Delete",
}: {
  id: string;
  confirmId: string | null;
  deletingId: string | null;
  onConfirm: () => void;
  onCancel: () => void;
  onDelete: () => void;
  label?: string;
}) {
  if (confirmId === id) {
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onDelete}
          disabled={deletingId === id}
          className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-50"
        >
          {deletingId === id ? "Deleting…" : "Confirm"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-3 py-1.5 text-sm text-gray-400 hover:text-white"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onConfirm}
      className="rounded-md px-3 py-1.5 text-sm font-medium text-red-400 transition hover:bg-red-500/10"
    >
      {label}
    </button>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-surface-dark p-8 text-center text-gray-400 ring-1 ring-white/10">
      {children}
    </div>
  );
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// ─── Root ─────────────────────────────────────────────────

export function AdminPage() {
  const [authed, setAuthed] = useState(!!getStoredPassword());

  if (!authed) {
    return <AdminLogin onLogin={() => setAuthed(true)} />;
  }

  return <AdminDashboard />;
}
