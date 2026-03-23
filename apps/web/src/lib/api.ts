import type {
  Attachment,
  AuthResponse,
  ChangeEmailInput,
  ChangePasswordInput,
  ForgotPasswordRequest,
  Invite,
  LoginRequest,
  Message,
  RefreshTokenRequest,
  RegisterRequest,
  ResetPasswordRequest,
  UpdateProfileInput,
  User,
  UserStatus,
  Webhook,
} from "@chat/shared";

const AUTH_STORAGE_KEY = "chat-auth";

function readPersistedAuth(): {
  accessToken: string | null;
  refreshToken: string | null;
} {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return { accessToken: null, refreshToken: null };
    const parsed = JSON.parse(raw) as {
      state?: {
        accessToken?: string | null;
        refreshToken?: string | null;
      };
    };
    return {
      accessToken: parsed.state?.accessToken ?? null,
      refreshToken: parsed.state?.refreshToken ?? null,
    };
  } catch {
    return { accessToken: null, refreshToken: null };
  }
}

function writePersistedAuth(accessToken: string, refreshToken: string) {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    const existing = raw ? JSON.parse(raw) : {};
    existing.state = {
      ...existing.state,
      accessToken,
      refreshToken,
    };
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(existing));
  } catch {
    /* ignore */
  }
}

export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

export class ApiClient {
  baseUrl = "";
  onAuthFailure: (() => void) | null = null;
  private refreshPromise: Promise<AuthResponse> | null = null;

  private async tryRefreshToken(): Promise<AuthResponse | null> {
    const { refreshToken } = readPersistedAuth();
    if (!refreshToken) return null;

    if (this.refreshPromise) return this.refreshPromise;

    this.refreshPromise = (async () => {
      try {
        const res = await fetch(`${this.baseUrl}/api/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken }),
        });
        if (!res.ok) return null as unknown as AuthResponse;
        const data = (await res.json()) as AuthResponse;
        writePersistedAuth(data.accessToken, data.refreshToken);
        return data;
      } catch {
        return null as unknown as AuthResponse;
      } finally {
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }

  protected async request<T>(
    method: string,
    path: string,
    body?: unknown,
    skipRefresh = false,
  ): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    const { accessToken } = readPersistedAuth();
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }

    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (
      res.status === 401 &&
      !skipRefresh &&
      !path.includes("/auth/login") &&
      !path.includes("/auth/register") &&
      !path.includes("/auth/refresh")
    ) {
      const refreshed = await this.tryRefreshToken();
      if (refreshed) {
        return this.request<T>(method, path, body, true);
      }
      this.onAuthFailure?.();
    }

    const contentType = res.headers.get("content-type") ?? "";
    const isJson = contentType.includes("application/json");

    if (!res.ok) {
      let errBody: unknown;
      let message = res.statusText || "Request failed";
      if (isJson) {
        try {
          errBody = await res.json();
          if (errBody && typeof errBody === "object" && "message" in errBody) {
            const msg = (errBody as { message: unknown }).message;
            if (typeof msg === "string") message = msg;
            else if (Array.isArray(msg)) message = msg.map(String).join(", ");
          }
        } catch {
          errBody = undefined;
        }
      } else {
        try {
          const text = await res.text();
          if (text) message = text;
        } catch {
          /* ignore */
        }
      }
      throw new ApiError(message, res.status, errBody);
    }

    if (res.status === 204 || res.headers.get("content-length") === "0") {
      return undefined as T;
    }

    if (isJson) {
      return (await res.json()) as T;
    }

    return undefined as T;
  }

  post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("POST", path, body);
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>("GET", path);
  }

  patch<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("PATCH", path, body);
  }

  delete<T>(path: string): Promise<T> {
    return this.request<T>("DELETE", path);
  }

  login(email: string, password: string): Promise<AuthResponse> {
    const payload: LoginRequest = { email, password };
    return this.post<AuthResponse>("/api/auth/login", payload);
  }

  register(
    username: string,
    email: string,
    password: string,
    inviteCode?: string,
  ): Promise<AuthResponse> {
    const payload: RegisterRequest & { inviteCode?: string } = {
      username,
      email,
      password,
      ...(inviteCode ? { inviteCode } : {}),
    };
    return this.post<AuthResponse>("/api/auth/register", payload);
  }

  getRegistrationMode(): Promise<{ mode: string }> {
    return this.get<{ mode: string }>("/api/auth/registration-mode");
  }

  refreshToken(token: string): Promise<AuthResponse> {
    const payload: RefreshTokenRequest = { refreshToken: token };
    return this.post<AuthResponse>("/api/auth/refresh", payload);
  }

  forgotPassword(email: string): Promise<{ message: string }> {
    const payload: ForgotPasswordRequest = { email };
    return this.post<{ message: string }>("/api/auth/forgot-password", payload);
  }

  resetPassword(token: string, password: string): Promise<{ message: string }> {
    const payload: ResetPasswordRequest = { token, password };
    return this.post<{ message: string }>("/api/auth/reset-password", payload);
  }

  getProfile(): Promise<User> {
    return this.get<User>("/api/auth/me");
  }

  searchUsers(q: string): Promise<{ id: string; username: string; avatarUrl: string | null }[]> {
    return this.get(`/api/auth/users/search?q=${encodeURIComponent(q)}`);
  }

  getVoiceToken(channelId: string): Promise<{ token: string; url: string; isAdmin: boolean }> {
    return this.post(`/api/voice/token/${channelId}`);
  }

  logout(refreshTokenValue: string): Promise<{ message: string }> {
    const payload: RefreshTokenRequest = { refreshToken: refreshTokenValue };
    return this.post<{ message: string }>("/api/auth/logout", payload);
  }

  updateProfile(data: UpdateProfileInput): Promise<User> {
    return this.patch<User>("/api/auth/profile", data);
  }

  async uploadAvatar(file: File): Promise<User> {
    return this.fetchWithFormData<User>("/api/auth/avatar", "avatar", file);
  }

  deleteAvatar(): Promise<User> {
    return this.delete<User>("/api/auth/avatar");
  }

  changePassword(data: ChangePasswordInput): Promise<{ message: string }> {
    return this.patch<{ message: string }>("/api/auth/password", data);
  }

  changeEmail(data: ChangeEmailInput): Promise<User> {
    return this.patch<User>("/api/auth/email", data);
  }

  updateStatus(status: UserStatus): Promise<User> {
    return this.patch<User>("/api/auth/status", { status });
  }

  async uploadAttachment(file: File): Promise<Attachment> {
    return this.fetchWithFormData<Attachment>(
      "/api/uploads/attachments",
      "file",
      file,
    );
  }

  private async fetchWithFormData<T>(
    path: string,
    fieldName: string,
    file: File,
  ): Promise<T> {
    const formData = new FormData();
    formData.append(fieldName, file);

    const headers: Record<string, string> = {};
    const { accessToken } = readPersistedAuth();
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }

    let res = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers,
      body: formData,
    });

    if (res.status === 401) {
      const refreshed = await this.tryRefreshToken();
      if (refreshed) {
        headers.Authorization = `Bearer ${refreshed.accessToken}`;
        res = await fetch(`${this.baseUrl}${path}`, {
          method: "POST",
          headers,
          body: formData,
        });
      } else {
        this.onAuthFailure?.();
      }
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const msg =
        typeof body?.message === "string" ? body.message : "Upload failed";
      throw new ApiError(msg, res.status, body);
    }

    return (await res.json()) as T;
  }

  toggleReaction(
    channelId: string,
    messageId: string,
    emoji: string,
    isCustom = false,
  ): Promise<{ action: "added" | "removed" }> {
    return this.post(
      `/api/channels/${channelId}/messages/${messageId}/reactions`,
      { emoji, isCustom },
    );
  }

  getPinnedMessages(channelId: string): Promise<Message[]> {
    return this.get(`/api/channels/${channelId}/messages/pinned`);
  }

  createInvite(
    serverId: string,
    opts?: { maxUses?: number; expiresInMinutes?: number },
  ): Promise<Invite> {
    return this.post(`/api/servers/${serverId}/invites`, opts);
  }

  getInvites(serverId: string): Promise<Invite[]> {
    return this.get(`/api/servers/${serverId}/invites`);
  }

  deleteInvite(inviteId: string): Promise<void> {
    return this.delete(`/api/invites/${inviteId}`);
  }

  joinViaInvite(code: string): Promise<unknown> {
    return this.post(`/api/invites/${code}/join`);
  }

  searchMessages(
    query: string,
    opts?: {
      serverId?: string;
      channelId?: string;
      dmOnly?: boolean;
      limit?: number;
    },
  ): Promise<{ results: SearchResult[] }> {
    const params = new URLSearchParams({ q: query });
    if (opts?.serverId) params.set("serverId", opts.serverId);
    if (opts?.channelId) params.set("channelId", opts.channelId);
    if (opts?.dmOnly) params.set("dmOnly", "true");
    if (opts?.limit) params.set("limit", String(opts.limit));
    return this.get(`/api/search/messages?${params}`);
  }

  getAllNotifPrefs(): Promise<{ prefs: Record<string, string> }> {
    return this.get("/api/notif-prefs/mine");
  }

  getNotifPref(channelId: string): Promise<{ level: string }> {
    return this.get(`/api/channels/${channelId}/notifications`);
  }

  setNotifPref(
    channelId: string,
    level: string,
  ): Promise<{ level: string }> {
    return this.request("PUT", `/api/channels/${channelId}/notifications`, {
      level,
    });
  }

  resetNotifPref(channelId: string): Promise<{ level: string }> {
    return this.request("DELETE", `/api/channels/${channelId}/notifications`);
  }

  getAuditLog(
    serverId: string,
    limit?: number,
    cursor?: string,
  ): Promise<{ entries: AuditLogEntry[]; hasMore: boolean }> {
    const params = new URLSearchParams();
    if (limit) params.set("limit", String(limit));
    if (cursor) params.set("cursor", cursor);
    const qs = params.toString();
    return this.get(`/api/servers/${serverId}/audit-log${qs ? `?${qs}` : ""}`);
  }

  createWebhook(channelId: string, name: string): Promise<Webhook> {
    return this.post(`/api/channels/${channelId}/webhooks`, { name });
  }

  getWebhooks(channelId: string): Promise<Webhook[]> {
    return this.get(`/api/channels/${channelId}/webhooks`);
  }

  deleteWebhook(webhookId: string): Promise<void> {
    return this.delete(`/api/webhooks/${webhookId}`);
  }

  updateServer(
    serverId: string,
    data: { name?: string },
  ): Promise<unknown> {
    return this.patch(`/api/servers/${serverId}`, data);
  }

  async uploadServerIcon(serverId: string, file: File): Promise<unknown> {
    return this.fetchWithFormData<unknown>(
      `/api/servers/${serverId}/icon`,
      "icon",
      file,
    );
  }

  deleteServerIcon(serverId: string): Promise<unknown> {
    return this.delete(`/api/servers/${serverId}/icon`);
  }

  deleteServer(serverId: string): Promise<void> {
    return this.request<void>("DELETE", `/api/servers/${serverId}`);
  }

  leaveServer(serverId: string): Promise<void> {
    return this.post(`/api/servers/${serverId}/leave`);
  }

  updateMemberRole(
    serverId: string,
    userId: string,
    role: string,
  ): Promise<unknown> {
    return this.patch(`/api/servers/${serverId}/members/${userId}/role`, {
      role,
    });
  }

  kickMember(serverId: string, userId: string): Promise<void> {
    return this.request<void>(
      "DELETE",
      `/api/servers/${serverId}/members/${userId}`,
    );
  }

  updateChannel(
    serverId: string,
    channelId: string,
    data: { name?: string; position?: number },
  ): Promise<unknown> {
    return this.patch(
      `/api/servers/${serverId}/channels/${channelId}`,
      data,
    );
  }

  deleteChannel(serverId: string, channelId: string): Promise<void> {
    return this.request<void>(
      "DELETE",
      `/api/servers/${serverId}/channels/${channelId}`,
    );
  }

  getDmConversations(): Promise<DmConversation[]> {
    return this.get("/api/dm");
  }

  createDm(recipientId: string): Promise<DmConversation> {
    return this.post("/api/dm", { recipientId });
  }

  createGroupDm(
    memberIds: string[],
    groupName?: string,
  ): Promise<DmConversation> {
    return this.post("/api/dm/group", { memberIds, groupName });
  }

  getDmConversation(id: string): Promise<DmConversation> {
    return this.get(`/api/dm/${id}`);
  }

  getDmMessages(
    conversationId: string,
    cursor?: string,
    limit = 50,
  ): Promise<{ messages: Message[]; hasMore: boolean }> {
    const params = new URLSearchParams();
    if (cursor) params.set("cursor", cursor);
    params.set("limit", String(limit));
    const qs = params.toString();
    return this.get(`/api/dm/${conversationId}/messages${qs ? `?${qs}` : ""}`);
  }

  getReadStates(): Promise<{
    channels: { channelId: string; mentionCount: number; lastReadAt: string }[];
    dms: { conversationId: string; mentionCount: number; lastReadAt: string }[];
  }> {
    return this.get("/api/read-states");
  }

  ackChannel(channelId: string): Promise<{ ok: boolean }> {
    return this.request("PUT", `/api/channels/${channelId}/ack`);
  }

  ackDm(conversationId: string): Promise<{ ok: boolean }> {
    return this.request("PUT", `/api/dm/${conversationId}/ack`);
  }

  getSessions(): Promise<ActiveSession[]> {
    return this.get("/api/auth/sessions");
  }

  revokeSession(id: string): Promise<{ message: string }> {
    return this.request("DELETE", `/api/auth/sessions/${id}`);
  }

  revokeAllSessions(refreshToken: string): Promise<{ message: string }> {
    return this.request("DELETE", "/api/auth/sessions", { refreshToken });
  }
}

export type SearchResult = {
  id: string;
  content: string | null;
  authorId: string | null;
  author: { id: string; username: string; avatarUrl: string | null } | null;
  channelId: string | null;
  channel: { id: string; name: string; serverId: string } | null;
  dmConversationId: string | null;
  createdAt: string;
};

export type AuditLogEntry = {
  id: string;
  serverId: string;
  actorId: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  details: string | null;
  createdAt: string;
  actor: { id: string; username: string; avatarUrl: string | null } | null;
};

export type DmConversation = {
  id: string;
  isGroup: boolean;
  groupName: string | null;
  createdAt: string;
  members: {
    userId: string;
    username: string;
    avatarUrl: string | null;
    bio: string | null;
    status: string;
    createdAt: string;
  }[];
  lastMessage?: {
    content: string | null;
    authorId: string;
    createdAt: string;
  } | null;
};

export type ActiveSession = {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  lastUsedAt: string | null;
  createdAt: string;
};

export const api = new ApiClient();
