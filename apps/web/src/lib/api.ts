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

function readPersistedAccessToken(): string | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      state?: { accessToken?: string | null };
    };
    return parsed.state?.accessToken ?? null;
  } catch {
    return null;
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
  protected readonly baseUrl = "";

  protected async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    const token = readPersistedAccessToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });

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
  ): Promise<AuthResponse> {
    const payload: RegisterRequest = { username, email, password };
    return this.post<AuthResponse>("/api/auth/register", payload);
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

  logout(refreshTokenValue: string): Promise<{ message: string }> {
    const payload: RefreshTokenRequest = { refreshToken: refreshTokenValue };
    return this.post<{ message: string }>("/api/auth/logout", payload);
  }

  updateProfile(data: UpdateProfileInput): Promise<User> {
    return this.patch<User>("/api/auth/profile", data);
  }

  async uploadAvatar(file: File): Promise<User> {
    const formData = new FormData();
    formData.append("avatar", file);

    const headers: Record<string, string> = {};
    const token = readPersistedAccessToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const res = await fetch(`${this.baseUrl}/api/auth/avatar`, {
      method: "POST",
      headers,
      body: formData,
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const msg =
        typeof body?.message === "string" ? body.message : "Upload failed";
      throw new ApiError(msg, res.status, body);
    }

    return (await res.json()) as User;
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
    const formData = new FormData();
    formData.append("file", file);

    const headers: Record<string, string> = {};
    const token = readPersistedAccessToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const res = await fetch(`${this.baseUrl}/api/uploads/attachments`, {
      method: "POST",
      headers,
      body: formData,
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const msg =
        typeof body?.message === "string" ? body.message : "Upload failed";
      throw new ApiError(msg, res.status, body);
    }

    return (await res.json()) as Attachment;
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
    opts?: { maxUses?: number; expiresInHours?: number },
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
    opts?: { serverId?: string; channelId?: string; limit?: number },
  ): Promise<{ results: SearchResult[] }> {
    const params = new URLSearchParams({ q: query });
    if (opts?.serverId) params.set("serverId", opts.serverId);
    if (opts?.channelId) params.set("channelId", opts.channelId);
    if (opts?.limit) params.set("limit", String(opts.limit));
    return this.get(`/api/search/messages?${params}`);
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
    const formData = new FormData();
    formData.append("icon", file);

    const headers: Record<string, string> = {};
    const token = readPersistedAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(`${this.baseUrl}/api/servers/${serverId}/icon`, {
      method: "POST",
      headers,
      body: formData,
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const msg =
        typeof body?.message === "string" ? body.message : "Upload failed";
      throw new ApiError(msg, res.status, body);
    }
    return (await res.json()) as unknown;
  }

  deleteServerIcon(serverId: string): Promise<unknown> {
    return this.delete(`/api/servers/${serverId}/icon`);
  }

  deleteServer(serverId: string): Promise<void> {
    return this.request<void>("DELETE", `/api/servers/${serverId}`);
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
}

export type SearchResult = {
  id: string;
  content: string | null;
  authorId: string;
  author: { id: string; username: string; avatarUrl: string | null };
  channelId: string | null;
  channel: { id: string; name: string; serverId: string } | null;
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
};

export const api = new ApiClient();
