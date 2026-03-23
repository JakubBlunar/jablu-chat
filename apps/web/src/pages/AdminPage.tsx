import { useCallback, useEffect, useState } from "react";

const ADMIN_TOKEN_KEY = "chat-admin-token";

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
  displayName: string | null;
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

type Tab = "servers" | "users" | "invites" | "audit" | "stats" | "storage" | "push";

type StatsData = {
  days: number;
  totalMessages: number;
  recentMessages: number;
  totalUsers: number;
  totalServers: number;
  topChannels: {
    channelId: string;
    name: string;
    serverName: string;
    count: number;
  }[];
  topUsers: {
    userId: string;
    username: string;
    displayName: string | null;
    count: number;
  }[];
};

type AuditLogEntry = {
  id: string;
  serverId: string;
  actorId: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  details: string | null;
  createdAt: string;
  actor: { id: string; username: string; displayName: string | null };
  server: { id: string; name: string };
};

type UserSession = {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  lastUsedAt: string | null;
  createdAt: string;
};

function getStoredToken(): string {
  return sessionStorage.getItem(ADMIN_TOKEN_KEY) ?? "";
}

function setStoredToken(token: string) {
  sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
}

function clearStoredToken() {
  sessionStorage.removeItem(ADMIN_TOKEN_KEY);
}

async function adminFetch<T>(
  path: string,
  opts?: { method?: string; body?: unknown },
): Promise<T> {
  const token = getStoredToken();
  const res = await fetch(path, {
    method: opts?.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      "x-admin-token": token,
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

function formatRetryTime(seconds: number): string {
  if (seconds >= 3600) {
    const h = Math.ceil(seconds / 3600);
    return `${h} hour${h !== 1 ? "s" : ""}`;
  }
  const m = Math.ceil(seconds / 60);
  return `${m} minute${m !== 1 ? "s" : ""}`;
}

function AdminLogin({ onLogin }: { onLogin: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [lockoutSeconds, setLockoutSeconds] = useState(0);

  useEffect(() => {
    if (lockoutSeconds <= 0) return;
    const id = setInterval(() => {
      setLockoutSeconds((s) => {
        if (s <= 1) return 0;
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [lockoutSeconds > 0]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (lockoutSeconds > 0) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        token?: string;
        retryAfter?: number;
      };
      if (data.ok && data.token) {
        setStoredToken(data.token);
        onLogin();
      } else {
        if (data.retryAfter) {
          setLockoutSeconds(data.retryAfter);
          setError(
            `Too many failed attempts. Try again in ${formatRetryTime(data.retryAfter)}.`,
          );
        } else {
          setError("Invalid credentials");
        }
      }
    } catch {
      setError("Connection failed");
    } finally {
      setBusy(false);
    }
  };

  const isLocked = lockoutSeconds > 0;

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-darkest p-4">
      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="w-full max-w-sm rounded-lg bg-surface-dark p-8 shadow-2xl ring-1 ring-white/10"
      >
        <h1 className="text-2xl font-bold text-white">Admin Panel</h1>
        <p className="mt-2 text-sm text-gray-400">
          Enter your superadmin credentials to continue.
        </p>
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Username"
          autoComplete="username"
          autoFocus
          disabled={isLocked}
          className="mt-5 w-full rounded-md bg-surface-darkest px-3 py-2.5 text-sm text-white outline-none ring-1 ring-white/10 placeholder:text-gray-500 focus:ring-2 focus:ring-primary disabled:opacity-50"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          autoComplete="current-password"
          disabled={isLocked}
          className="mt-3 w-full rounded-md bg-surface-darkest px-3 py-2.5 text-sm text-white outline-none ring-1 ring-white/10 placeholder:text-gray-500 focus:ring-2 focus:ring-primary disabled:opacity-50"
        />
        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
        {isLocked && (
          <p className="mt-1 text-xs text-gray-500">
            Locked for {formatRetryTime(lockoutSeconds)}
          </p>
        )}
        <button
          type="submit"
          disabled={busy || !username || !password || isLocked}
          className="mt-4 w-full rounded-md bg-primary py-2.5 text-sm font-medium text-white transition hover:bg-primary-hover disabled:opacity-50"
        >
          {busy ? "Checking…" : isLocked ? "Locked" : "Login"}
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
      if (msg.includes("Unauthorized") || msg.includes("admin token") || msg.includes("expired")) {
        clearStoredToken();
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
              const token = getStoredToken();
              if (token) {
                void fetch("/api/admin/logout", {
                  method: "POST",
                  headers: { "x-admin-token": token },
                });
              }
              clearStoredToken();
              window.location.reload();
            }}
            className="rounded-md px-4 py-2 text-sm font-medium text-gray-400 transition hover:bg-white/5 hover:text-white"
          >
            Logout
          </button>
        </div>

        <div className="mt-4 flex gap-1 border-b border-white/10">
          {(["servers", "users", "invites", "audit", "stats", "storage", "push"] as const).map((t) => {
            let label = t as string;
            if (t === "servers") label = `Servers (${servers.length})`;
            else if (t === "users") label = `Users (${users.length})`;
            else if (t === "invites") label = `Invites (${invites.length})`;
            else if (t === "audit") label = "Audit Log";
            else if (t === "stats") label = "Stats";
            else if (t === "storage") label = "Storage";
            else if (t === "push") label = "Push";
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
          {tab === "audit" && <AuditLogTab servers={servers} />}
          {tab === "stats" && <StatsTab />}
          {tab === "storage" && <StorageTab />}
          {tab === "push" && <PushTab users={users} />}
        </div>
      </div>
    </div>
  );
}

// ─── Servers Tab ──────────────────────────────────────────

type ServerMemberRow = {
  userId: string;
  serverId: string;
  role: string;
  joinedAt: string;
  user: { id: string; username: string; email: string; avatarUrl: string | null };
};

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

  const [expandedId, setExpandedId] = useState<string | null>(null);

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
              className="rounded-lg bg-surface-dark ring-1 ring-white/10"
            >
              <div className="flex items-center gap-4 p-4">
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
                <button
                  type="button"
                  onClick={() => setExpandedId(expandedId === server.id ? null : server.id)}
                  className="rounded-md px-3 py-1.5 text-sm font-medium text-gray-400 transition hover:bg-white/5 hover:text-white"
                >
                  Members
                </button>
                <ConfirmDeleteBtn
                  id={server.id}
                  confirmId={confirmDeleteId}
                  deletingId={deletingId}
                  onConfirm={() => setConfirmDeleteId(server.id)}
                  onCancel={() => setConfirmDeleteId(null)}
                  onDelete={() => void handleDelete(server.id)}
                />
              </div>
              {expandedId === server.id && (
                <ServerMembersPanel
                  server={server}
                  users={users}
                  onMemberCountChange={(delta) =>
                    setServers((prev) =>
                      prev.map((s) =>
                        s.id === server.id
                          ? { ...s, _count: { ...s._count, members: s._count.members + delta } }
                          : s,
                      ),
                    )
                  }
                  onServerUpdate={(patch) =>
                    setServers((prev) =>
                      prev.map((s) =>
                        s.id === server.id ? { ...s, ...patch } : s,
                      ),
                    )
                  }
                />
              )}
            </div>
          ))
        )}
      </div>
    </>
  );
}

function ServerMembersPanel({
  server,
  users,
  onMemberCountChange,
  onServerUpdate,
}: {
  server: AdminServer;
  users: AdminUser[];
  onMemberCountChange: (delta: number) => void;
  onServerUpdate: (patch: Partial<AdminServer>) => void;
}) {
  const [members, setMembers] = useState<ServerMemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [addUserId, setAddUserId] = useState("");
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [updatingRoleId, setUpdatingRoleId] = useState<string | null>(null);

  const fetchMembers = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await adminFetch<ServerMemberRow[]>(
        `/api/admin/servers/${server.id}/members`,
      );
      setMembers(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load members");
    } finally {
      setLoading(false);
    }
  }, [server.id]);

  useEffect(() => {
    void fetchMembers();
  }, [fetchMembers]);

  const memberIds = new Set(members.map((m) => m.userId));
  const nonMembers = users.filter((u) => !memberIds.has(u.id));

  const handleAdd = async () => {
    if (!addUserId) return;
    setAdding(true);
    setError("");
    try {
      const member = await adminFetch<ServerMemberRow>(
        `/api/admin/servers/${server.id}/members`,
        { method: "POST", body: { userId: addUserId } },
      );
      setMembers((prev) => [...prev, member]);
      setAddUserId("");
      onMemberCountChange(1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add member");
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (userId: string) => {
    setRemovingId(userId);
    setError("");
    try {
      await adminFetch(`/api/admin/servers/${server.id}/members/${userId}`, {
        method: "DELETE",
      });
      setMembers((prev) => prev.filter((m) => m.userId !== userId));
      onMemberCountChange(-1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove member");
    } finally {
      setRemovingId(null);
    }
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    if (newRole === "owner" && !window.confirm(
      "Transfer server ownership to this user? The current owner will be demoted to admin.",
    )) return;

    setUpdatingRoleId(userId);
    setError("");
    try {
      const result = await adminFetch<{
        members: ServerMemberRow[];
        owner: { id: string; username: string };
        ownerId: string;
      }>(
        `/api/admin/servers/${server.id}/members/${userId}/role`,
        { method: "PATCH", body: { role: newRole } },
      );
      setMembers(result.members);
      onServerUpdate({ ownerId: result.ownerId, owner: result.owner });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update role");
    } finally {
      setUpdatingRoleId(null);
    }
  };

  return (
    <div className="border-t border-white/5 px-4 pb-4 pt-3">
      {error && (
        <div className="mb-3 rounded-md bg-red-900/30 px-3 py-2 text-sm text-red-300 ring-1 ring-red-500/30">
          {error}
        </div>
      )}

      <div className="mb-3 flex items-center gap-2">
        <select
          value={addUserId}
          onChange={(e) => setAddUserId(e.target.value)}
          className="min-w-0 flex-1 rounded-md bg-surface-darkest px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-primary"
        >
          <option value="">Add a user…</option>
          {nonMembers.map((u) => (
            <option key={u.id} value={u.id}>
              {u.username} ({u.email})
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => void handleAdd()}
          disabled={adding || !addUserId}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium transition hover:bg-primary-hover disabled:opacity-50"
        >
          {adding ? "Adding…" : "Add"}
        </button>
      </div>

      {loading ? (
        <p className="py-4 text-center text-sm text-gray-500">Loading members…</p>
      ) : members.length === 0 ? (
        <p className="py-4 text-center text-sm text-gray-500">No members.</p>
      ) : (
        <div className="space-y-1">
          {members.map((m) => (
            <div
              key={m.userId}
              className="flex items-center gap-3 rounded-md px-3 py-2 transition hover:bg-white/[0.03]"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface text-xs font-semibold uppercase">
                {m.user.avatarUrl ? (
                  <img src={m.user.avatarUrl} alt="" className="h-full w-full rounded-full object-cover" />
                ) : (
                  m.user.username.charAt(0)
                )}
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-sm font-medium text-white">{m.user.username}</span>
                <span className="ml-2 text-xs text-gray-500">{m.user.email}</span>
              </div>
              <select
                value={m.role}
                onChange={(e) => void handleRoleChange(m.userId, e.target.value)}
                disabled={updatingRoleId === m.userId}
                className={`rounded-md px-2 py-1 text-xs font-semibold uppercase outline-none disabled:opacity-50 ${
                  m.role === "owner"
                    ? "bg-yellow-500/20 text-yellow-400"
                    : m.role === "admin"
                      ? "bg-blue-500/20 text-blue-400"
                      : "bg-white/5 text-gray-400"
                }`}
              >
                <option value="owner">Owner</option>
                <option value="admin">Admin</option>
                <option value="member">Member</option>
              </select>
              {m.role !== "owner" && (
                <button
                  type="button"
                  onClick={() => void handleRemove(m.userId)}
                  disabled={removingId === m.userId}
                  className="rounded-md px-2 py-1 text-xs font-medium text-red-400 transition hover:bg-red-500/10 disabled:opacity-50"
                >
                  {removingId === m.userId ? "Removing…" : "Remove"}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
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
    displayName: "",
    email: "",
    bio: "",
  });
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState("");

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [sessionsUserId, setSessionsUserId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState("");

  const toggleSessions = async (userId: string) => {
    if (sessionsUserId === userId) {
      setSessionsUserId(null);
      return;
    }
    setSessionsUserId(userId);
    setSessionsLoading(true);
    setSessionsError("");
    try {
      const s = await adminFetch<UserSession[]>(
        `/api/admin/users/${userId}/sessions`,
      );
      setSessions(s);
    } catch (e) {
      setSessionsError(e instanceof Error ? e.message : "Failed");
    } finally {
      setSessionsLoading(false);
    }
  };

  const revokeSession = async (userId: string, sessionId: string) => {
    try {
      await adminFetch(`/api/admin/users/${userId}/sessions/${sessionId}`, {
        method: "DELETE",
      });
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    } catch (e) {
      setSessionsError(e instanceof Error ? e.message : "Failed to revoke");
    }
  };

  const revokeAllSessions = async (userId: string) => {
    try {
      await adminFetch(`/api/admin/users/${userId}/sessions`, {
        method: "DELETE",
      });
      setSessions([]);
    } catch (e) {
      setSessionsError(e instanceof Error ? e.message : "Failed to revoke");
    }
  };

  const startEdit = (user: AdminUser) => {
    setEditingId(user.id);
    setEditForm({
      username: user.username,
      displayName: user.displayName ?? user.username,
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
            displayName: editForm.displayName.trim(),
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
                  onClick={() => void toggleSessions(user.id)}
                  className="rounded-md px-3 py-1.5 text-sm font-medium text-gray-300 transition hover:bg-white/5 hover:text-white"
                >
                  {sessionsUserId === user.id ? "Hide Sessions" : "Sessions"}
                </button>
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

            {sessionsUserId === user.id && (
              <div className="border-t border-white/5 p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-semibold text-gray-300">
                    Active Sessions ({sessions.length})
                  </h4>
                  {sessions.length > 0 && (
                    <button
                      type="button"
                      onClick={() => void revokeAllSessions(user.id)}
                      className="rounded-md px-3 py-1 text-xs font-medium text-red-400 transition hover:bg-red-900/30 hover:text-red-300"
                    >
                      Revoke All
                    </button>
                  )}
                </div>
                {sessionsLoading ? (
                  <p className="text-sm text-gray-400">Loading…</p>
                ) : sessionsError ? (
                  <p className="text-sm text-red-400">{sessionsError}</p>
                ) : sessions.length === 0 ? (
                  <p className="text-sm text-gray-500">No active sessions.</p>
                ) : (
                  <div className="space-y-2">
                    {sessions.map((s) => (
                      <div
                        key={s.id}
                        className="flex items-center gap-3 rounded-md bg-surface-darkest px-3 py-2 ring-1 ring-white/5"
                      >
                        <div className="min-w-0 flex-1 text-sm">
                          <p className="truncate text-gray-300">
                            {s.userAgent
                              ? s.userAgent.length > 80
                                ? s.userAgent.slice(0, 80) + "…"
                                : s.userAgent
                              : "Unknown device"}
                          </p>
                          <p className="text-xs text-gray-500">
                            IP: {s.ipAddress ?? "Unknown"} &middot; Created{" "}
                            {fmtDate(s.createdAt)}
                            {s.lastUsedAt &&
                              ` · Last used ${new Date(s.lastUsedAt).toLocaleString()}`}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void revokeSession(user.id, s.id)}
                          className="shrink-0 rounded-md px-2.5 py-1 text-xs font-medium text-red-400 transition hover:bg-red-900/30 hover:text-red-300"
                        >
                          Revoke
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

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
                      Display Name
                    </span>
                    <input
                      type="text"
                      value={editForm.displayName}
                      onChange={(e) =>
                        setEditForm((f) => ({
                          ...f,
                          displayName: e.target.value,
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

// ─── Stats Tab ────────────────────────────────────────────

function StatCard({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-lg bg-surface-dark p-4 ring-1 ring-white/10">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold text-white">{value}</p>
    </div>
  );
}

function BarChart({
  items,
  labelKey,
  valueKey,
}: {
  items: { label: string; sub?: string; value: number }[];
  labelKey: string;
  valueKey: string;
}) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-gray-400">
        <span>{labelKey}</span>
        <span>{valueKey}</span>
      </div>
      {items.map((item, i) => (
        <div key={i}>
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="truncate text-white">
              {item.label}
              {item.sub && (
                <span className="ml-1.5 text-gray-500">{item.sub}</span>
              )}
            </span>
            <span className="shrink-0 ml-3 font-medium text-gray-300">
              {item.value.toLocaleString()}
            </span>
          </div>
          <div className="h-2 rounded-full bg-white/5">
            <div
              className="h-2 rounded-full bg-primary transition-all"
              style={{ width: `${(item.value / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function StatsTab() {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [days, setDays] = useState(30);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await adminFetch<StatsData>(
        `/api/admin/stats?days=${days}`,
      );
      setStats(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    void fetchStats();
  }, [fetchStats]);

  if (loading) {
    return <div className="text-center text-gray-400 py-8">Loading…</div>;
  }

  if (error) {
    return (
      <div className="rounded-md bg-red-900/30 px-4 py-3 text-sm text-red-300 ring-1 ring-red-500/30">
        {error}
        <button
          type="button"
          onClick={() => void fetchStats()}
          className="ml-2 underline hover:text-white"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-400">Time range:</span>
        {[7, 30, 90].map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDays(d)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
              days === d
                ? "bg-primary text-white"
                : "text-gray-400 hover:bg-white/5 hover:text-white"
            }`}
          >
            {d}d
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total Messages" value={stats.totalMessages.toLocaleString()} />
        <StatCard
          label={`Messages (${days}d)`}
          value={stats.recentMessages.toLocaleString()}
        />
        <StatCard label="Users" value={stats.totalUsers} />
        <StatCard label="Servers" value={stats.totalServers} />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-lg bg-surface-dark p-4 ring-1 ring-white/10">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-400">
            Top Channels ({days}d)
          </h3>
          {stats.topChannels.length === 0 ? (
            <p className="text-sm text-gray-500">No activity.</p>
          ) : (
            <BarChart
              items={stats.topChannels.map((c) => ({
                label: `#${c.name}`,
                sub: c.serverName,
                value: c.count,
              }))}
              labelKey="Channel"
              valueKey="Messages"
            />
          )}
        </div>

        <div className="rounded-lg bg-surface-dark p-4 ring-1 ring-white/10">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-400">
            Top Users ({days}d)
          </h3>
          {stats.topUsers.length === 0 ? (
            <p className="text-sm text-gray-500">No activity.</p>
          ) : (
            <BarChart
              items={stats.topUsers.map((u) => ({
                label: u.displayName ?? u.username,
                sub: u.displayName ? `@${u.username}` : undefined,
                value: u.count,
              }))}
              labelKey="User"
              valueKey="Messages"
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Audit Log Tab ────────────────────────────────────────

function AuditLogTab({ servers }: { servers: AdminServer[] }) {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filterServerId, setFilterServerId] = useState("");

  const fetchLogs = useCallback(
    async (cursor?: string) => {
      const isFirstPage = !cursor;
      if (isFirstPage) setLoading(true);
      else setLoadingMore(true);
      setError("");
      try {
        const params = new URLSearchParams();
        if (filterServerId) params.set("serverId", filterServerId);
        if (cursor) params.set("cursor", cursor);
        params.set("limit", "50");
        const data = await adminFetch<{
          logs: AuditLogEntry[];
          nextCursor: string | null;
        }>(`/api/admin/audit-logs?${params}`);
        if (isFirstPage) setLogs(data.logs);
        else setLogs((prev) => [...prev, ...data.logs]);
        setNextCursor(data.nextCursor);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [filterServerId],
  );

  useEffect(() => {
    void fetchLogs();
  }, [fetchLogs]);

  const actionColor: Record<string, string> = {
    "channel:create": "bg-green-900/40 text-green-300",
    "channel:update": "bg-blue-900/40 text-blue-300",
    "channel:delete": "bg-red-900/40 text-red-300",
    "channel:reorder": "bg-purple-900/40 text-purple-300",
    "member:kick": "bg-red-900/40 text-red-300",
    "member:ban": "bg-red-900/40 text-red-300",
    "member:role_change": "bg-yellow-900/40 text-yellow-300",
    "server:update": "bg-blue-900/40 text-blue-300",
    "emoji:create": "bg-green-900/40 text-green-300",
    "emoji:delete": "bg-red-900/40 text-red-300",
    "webhook:create": "bg-green-900/40 text-green-300",
    "webhook:delete": "bg-red-900/40 text-red-300",
  };
  const defaultBadge = "bg-gray-800 text-gray-300";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <select
          value={filterServerId}
          onChange={(e) => setFilterServerId(e.target.value)}
          className="rounded-md bg-surface-darkest px-3 py-2 text-sm text-white outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-primary"
        >
          <option value="">All servers</option>
          {servers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="rounded-md bg-red-900/30 px-4 py-2 text-sm text-red-300 ring-1 ring-red-500/30">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center text-gray-400 py-8">Loading…</div>
      ) : logs.length === 0 ? (
        <Empty>No audit logs found.</Empty>
      ) : (
        <div className="space-y-1">
          {logs.map((log) => (
            <div
              key={log.id}
              className="flex items-start gap-3 rounded-lg bg-surface-dark px-4 py-3 ring-1 ring-white/5"
            >
              <span
                className={`mt-0.5 shrink-0 rounded px-2 py-0.5 text-xs font-semibold ${actionColor[log.action] ?? defaultBadge}`}
              >
                {log.action}
              </span>
              <div className="min-w-0 flex-1 text-sm">
                <span className="font-medium text-white">
                  {log.actor?.displayName ?? log.actor?.username ?? "Unknown"}
                </span>
                <span className="text-gray-400"> in </span>
                <span className="font-medium text-gray-300">
                  {log.server?.name ?? "Deleted Server"}
                </span>
                {log.details && (
                  <p className="mt-0.5 text-gray-500 break-all">{log.details}</p>
                )}
              </div>
              <time className="shrink-0 text-xs text-gray-500 whitespace-nowrap">
                {new Date(log.createdAt).toLocaleString()}
              </time>
            </div>
          ))}
        </div>
      )}

      {nextCursor && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => void fetchLogs(nextCursor)}
            disabled={loadingMore}
            className="rounded-md bg-white/5 px-4 py-2 text-sm font-medium text-gray-300 transition hover:bg-white/10 disabled:opacity-50"
          >
            {loadingMore ? "Loading…" : "Load More"}
          </button>
        </div>
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
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// ─── Push Tab ────────────────────────────────────────────

function PushTab({ users }: { users: AdminUser[] }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const toggleUser = (id: string) => {
    setSelectedUsers((prev) =>
      prev.includes(id) ? prev.filter((u) => u !== id) : [...prev, id],
    );
  };

  const handleSend = async () => {
    if (!title.trim() || !body.trim()) {
      setResult({ type: "error", text: "Title and body are required." });
      return;
    }
    setSending(true);
    setResult(null);
    try {
      const payload: { title: string; body: string; userIds?: string[] } = {
        title: title.trim(),
        body: body.trim(),
      };
      if (selectedUsers.length > 0) {
        payload.userIds = selectedUsers;
      }
      const res = await adminFetch<{ sent: number }>("/api/admin/push", {
        method: "POST",
        body: payload,
      });
      setResult({
        type: "success",
        text: `Notification sent to ${res.sent} subscription${res.sent !== 1 ? "s" : ""}.`,
      });
      setTitle("");
      setBody("");
    } catch (err: any) {
      setResult({ type: "error", text: err?.message ?? "Failed to send notification" });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-gray-400">
          Send a push notification to selected users, or leave the user
          selection empty to notify everyone.
        </p>
      </div>

      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-[11px] font-semibold tracking-wide text-gray-400">
            TITLE
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Notification title"
            className="w-full rounded-md border border-white/10 bg-surface-dark px-3 py-2 text-sm text-gray-200 outline-none transition placeholder:text-gray-500 focus:border-primary"
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-semibold tracking-wide text-gray-400">
            BODY
          </label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Notification message"
            rows={3}
            className="w-full resize-none rounded-md border border-white/10 bg-surface-dark px-3 py-2 text-sm text-gray-200 outline-none transition placeholder:text-gray-500 focus:border-primary"
          />
        </div>
      </div>

      <div>
        <p className="mb-2 text-[11px] font-semibold tracking-wide text-gray-400">
          RECIPIENTS {selectedUsers.length > 0 ? `(${selectedUsers.length} selected)` : "(all)"}
        </p>
        <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg bg-surface-dark p-2">
          {users.map((u) => (
            <label
              key={u.id}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-gray-300 transition hover:bg-white/5"
            >
              <input
                type="checkbox"
                checked={selectedUsers.includes(u.id)}
                onChange={() => toggleUser(u.id)}
                className="rounded border-gray-600 bg-surface-darkest text-primary focus:ring-primary"
              />
              <span className="truncate">{u.username}</span>
              <span className="ml-auto text-xs text-gray-500">{u.email}</span>
            </label>
          ))}
        </div>
      </div>

      {result && (
        <p className={`text-sm ${result.type === "error" ? "text-red-400" : "text-emerald-400"}`}>
          {result.text}
        </p>
      )}

      <button
        type="button"
        onClick={() => void handleSend()}
        disabled={sending}
        className="rounded-md bg-primary px-5 py-2 text-sm font-medium text-white transition hover:bg-primary-hover disabled:opacity-50"
      >
        {sending ? "Sending..." : "Send Notification"}
      </button>
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────

export function AdminPage() {
  const [authed, setAuthed] = useState(!!getStoredToken());

  if (!authed) {
    return <AdminLogin onLogin={() => setAuthed(true)} />;
  }

  return <AdminDashboard />;
}
