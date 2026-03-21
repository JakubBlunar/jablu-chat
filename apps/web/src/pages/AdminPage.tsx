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

type Tab = "servers" | "users";

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
    <div className="flex min-h-screen items-center justify-center bg-[#1e1f22] p-4">
      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="w-full max-w-sm rounded-lg bg-[#2b2d31] p-8 shadow-2xl ring-1 ring-white/10"
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
          className="mt-5 w-full rounded-md bg-[#1e1f22] px-3 py-2.5 text-sm text-white outline-none ring-1 ring-white/10 placeholder:text-gray-500 focus:ring-2 focus:ring-[#5865f2]"
        />
        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={busy || !password}
          className="mt-4 w-full rounded-md bg-[#5865f2] py-2.5 text-sm font-medium text-white transition hover:bg-[#4752c4] disabled:opacity-50"
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchAll = useCallback(async () => {
    setError("");
    try {
      const [s, u] = await Promise.all([
        adminFetch<AdminServer[]>("/api/admin/servers"),
        adminFetch<AdminUser[]>("/api/admin/users"),
      ]);
      setServers(s);
      setUsers(u);
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
      <div className="flex min-h-screen items-center justify-center bg-[#1e1f22]">
        <div className="text-gray-400">Loading…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#1e1f22] p-6 text-white">
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
          {(["servers", "users"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`rounded-t-md px-4 py-2.5 text-sm font-medium capitalize transition ${
                tab === t
                  ? "bg-[#2b2d31] text-white"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              {t} ({t === "servers" ? servers.length : users.length})
            </button>
          ))}
        </div>

        <div className="mt-4">
          {tab === "servers" ? (
            <ServersTab
              servers={servers}
              setServers={setServers}
              users={users}
            />
          ) : (
            <UsersTab users={users} setUsers={setUsers} />
          )}
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
          className="rounded-md bg-[#5865f2] px-4 py-2 text-sm font-medium transition hover:bg-[#4752c4]"
        >
          {showCreate ? "Cancel" : "Create Server"}
        </button>
      </div>

      {showCreate && (
        <div className="mt-4 rounded-lg bg-[#2b2d31] p-5 ring-1 ring-white/10">
          <h2 className="text-lg font-semibold">Create New Server</h2>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Server name"
              className="flex-1 rounded-md bg-[#1e1f22] px-3 py-2 text-sm outline-none ring-1 ring-white/10 placeholder:text-gray-500 focus:ring-2 focus:ring-[#5865f2]"
            />
            <select
              value={newOwnerId}
              onChange={(e) => setNewOwnerId(e.target.value)}
              className="rounded-md bg-[#1e1f22] px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-[#5865f2]"
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
              className="rounded-md bg-[#23a559] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#1a7d43] disabled:opacity-50"
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
              className="flex items-center gap-4 rounded-lg bg-[#2b2d31] p-4 ring-1 ring-white/10"
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#313338] text-lg font-semibold">
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
            className="rounded-lg bg-[#2b2d31] ring-1 ring-white/10"
          >
            <div className="flex items-center gap-4 p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#5865f2] text-sm font-bold uppercase text-white">
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
                      className="mt-1 w-full rounded-md bg-[#1e1f22] px-3 py-2 text-sm text-white outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-[#5865f2]"
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
                      className="mt-1 w-full rounded-md bg-[#1e1f22] px-3 py-2 text-sm text-white outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-[#5865f2]"
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
                    className="mt-1 w-full resize-none rounded-md bg-[#1e1f22] px-3 py-2 text-sm text-white outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-[#5865f2]"
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
                    className="rounded-md bg-[#5865f2] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#4752c4] disabled:opacity-50"
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
    <div className="rounded-lg bg-[#2b2d31] p-8 text-center text-gray-400 ring-1 ring-white/10">
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
