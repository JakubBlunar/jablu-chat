import type {
  Attachment,
  AuthResponse,
  BotApplication,
  BotCommandWithBot,
  ChangeEmailInput,
  ChangePasswordInput,
  ChannelCategory,
  CreateEventInput,
  ForgotPasswordRequest,
  ForumTag,
  Invite,
  LoginRequest,
  Message,
  Poll,
  RefreshTokenRequest,
  RegisterRequest,
  ResetPasswordRequest,
  ServerEvent,
  StatusDurationPreset,
  UpdateEventInput,
  UpdateProfileInput,
  UpdatePushPrefsInput,
  User,
  UserStatus,
  Webhook
} from '@chat/shared'

import { readPersistedAuth, writePersistedAuth } from './auth-storage'
import { ApiError } from './errors'
import type {
  ActiveSession,
  AuditLogEntry,
  AutoModRule,
  CustomEmoji,
  DmConversation,
  EmojiStat,
  GifSearchResult,
  OnboardingConfig,
  SearchResult,
  ServerInsights,
  InAppNotificationDto
} from './types'

export class ApiClient {
  baseUrl = ''
  onAuthFailure: (() => void) | null = null
  onTokenRefresh: ((accessToken: string, refreshToken: string) => void) | null = null
  onApiError: ((error: ApiError) => void) | null = null
  private refreshPromise: Promise<AuthResponse> | null = null

  private async tryRefreshToken(): Promise<AuthResponse | null> {
    const { refreshToken } = readPersistedAuth()
    if (!refreshToken) return null

    if (this.refreshPromise) return this.refreshPromise

    this.refreshPromise = (async () => {
      try {
        const res = await fetch(`${this.baseUrl}/api/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken })
        })
        if (!res.ok) {
          if (res.status === 401 || res.status === 403) return null as unknown as AuthResponse
          return { _networkError: true } as unknown as AuthResponse
        }
        const data = (await res.json()) as AuthResponse
        writePersistedAuth(data.accessToken, data.refreshToken)
        this.onTokenRefresh?.(data.accessToken, data.refreshToken)
        return data
      } catch {
        return { _networkError: true } as unknown as AuthResponse
      } finally {
        this.refreshPromise = null
      }
    })()

    return this.refreshPromise
  }

  protected async request<T>(method: string, path: string, body?: unknown, skipRefresh = false): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    }

    const { accessToken } = readPersistedAuth()
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`
    }

    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    })

    if (
      res.status === 401 &&
      !skipRefresh &&
      !path.includes('/auth/login') &&
      !path.includes('/auth/register') &&
      !path.includes('/auth/refresh')
    ) {
      const refreshed = await this.tryRefreshToken()
      if (refreshed && !(refreshed as unknown as { _networkError?: boolean })._networkError) {
        return this.request<T>(method, path, body, true)
      }
      if (!refreshed) {
        this.onAuthFailure?.()
      }
    }

    const contentType = res.headers.get('content-type') ?? ''
    const isJson = contentType.includes('application/json')

    if (!res.ok) {
      let errBody: unknown
      let message = res.statusText || 'Request failed'
      if (isJson) {
        try {
          errBody = await res.json()
          if (errBody && typeof errBody === 'object' && 'message' in errBody) {
            const msg = (errBody as { message: unknown }).message
            if (typeof msg === 'string') message = msg
            else if (Array.isArray(msg)) message = msg.map(String).join(', ')
          }
        } catch {
          errBody = undefined
        }
      } else {
        try {
          const text = await res.text()
          if (text) message = text
        } catch {
          /* ignore */
        }
      }
      const apiError = new ApiError(message, res.status, errBody)
      if (res.status !== 401) this.onApiError?.(apiError)
      throw apiError
    }

    if (res.status === 204 || res.headers.get('content-length') === '0') {
      return undefined as T
    }

    if (isJson) {
      return (await res.json()) as T
    }

    return undefined as T
  }

  post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', path, body)
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path)
  }

  patch<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('PATCH', path, body)
  }

  put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('PUT', path, body)
  }

  delete<T>(path: string): Promise<T> {
    return this.request<T>('DELETE', path)
  }

  login(email: string, password: string): Promise<AuthResponse> {
    const payload: LoginRequest = { email, password }
    return this.post<AuthResponse>('/api/auth/login', payload)
  }

  register(username: string, email: string, password: string, inviteCode?: string): Promise<AuthResponse> {
    const payload: RegisterRequest & { inviteCode?: string } = {
      username,
      email,
      password,
      ...(inviteCode ? { inviteCode } : {})
    }
    return this.post<AuthResponse>('/api/auth/register', payload)
  }

  getRegistrationMode(): Promise<{ mode: string }> {
    return this.get<{ mode: string }>('/api/auth/registration-mode')
  }

  refreshToken(token: string): Promise<AuthResponse> {
    const payload: RefreshTokenRequest = { refreshToken: token }
    return this.post<AuthResponse>('/api/auth/refresh', payload)
  }

  forgotPassword(email: string): Promise<{ message: string }> {
    const payload: ForgotPasswordRequest = { email }
    return this.post<{ message: string }>('/api/auth/forgot-password', payload)
  }

  resetPassword(token: string, password: string): Promise<{ message: string }> {
    const payload: ResetPasswordRequest = { token, password }
    return this.post<{ message: string }>('/api/auth/reset-password', payload)
  }

  getProfile(): Promise<User> {
    return this.get<User>('/api/auth/me')
  }

  searchUsers(
    q: string
  ): Promise<{ id: string; username: string; displayName: string | null; avatarUrl: string | null }[]> {
    return this.get(`/api/auth/users/search?q=${encodeURIComponent(q)}`)
  }

  getMutualServers(userId: string): Promise<{
    servers: {
      id: string
      name: string
      iconUrl: string | null
      channels: { id: string; name: string }[]
    }[]
  }> {
    return this.get(`/api/users/${userId}/mutual-servers`)
  }

  getMutualFriends(userId: string): Promise<{
    friends: {
      id: string
      username: string
      displayName: string | null
      avatarUrl: string | null
      status: string
    }[]
  }> {
    return this.get(`/api/users/${userId}/mutual-friends`)
  }

  getFriends(): Promise<import('@chat/shared').Friend[]> {
    return this.get('/api/friends')
  }

  getPendingFriendRequests(): Promise<import('@chat/shared').FriendRequest[]> {
    return this.get('/api/friends/pending')
  }

  getFriendshipStatus(userId: string): Promise<import('@chat/shared').FriendshipStatusResponse> {
    return this.get(`/api/friends/status/${userId}`)
  }

  sendFriendRequest(userId: string): Promise<{ ok: boolean; friendshipId: string }> {
    return this.post('/api/friends/request', { userId })
  }

  acceptFriendRequest(id: string): Promise<{ ok: boolean }> {
    return this.post(`/api/friends/${id}/accept`, {})
  }

  declineFriendRequest(id: string): Promise<{ ok: boolean }> {
    return this.delete(`/api/friends/${id}/decline`)
  }

  cancelFriendRequest(id: string): Promise<{ ok: boolean }> {
    return this.delete(`/api/friends/${id}/cancel`)
  }

  removeFriend(id: string): Promise<{ ok: boolean }> {
    return this.delete(`/api/friends/${id}`)
  }

  updateDmPrivacy(dmPrivacy: 'everyone' | 'friends_only'): Promise<import('@chat/shared').User> {
    return this.patch('/api/auth/privacy', { dmPrivacy })
  }

  canDmUser(userId: string): Promise<{ allowed: boolean }> {
    return this.get(`/api/dm/can-dm/${userId}`)
  }

  getGifEnabled(): Promise<{ enabled: boolean }> {
    return this.get('/api/gif/enabled')
  }

  searchGifs(q: string, limit = 20, offset?: string): Promise<GifSearchResult> {
    const params = new URLSearchParams({ q, limit: String(limit) })
    if (offset) params.set('offset', offset)
    return this.get(`/api/gif/search?${params}`)
  }

  getTrendingGifs(limit = 20, offset?: string): Promise<GifSearchResult> {
    const params = new URLSearchParams({ limit: String(limit) })
    if (offset) params.set('offset', offset)
    return this.get(`/api/gif/trending?${params}`)
  }

  getVoiceToken(channelId: string): Promise<{ token: string; url: string; isAdmin: boolean }> {
    return this.post(`/api/voice/token/${channelId}`)
  }

  getVoiceVolumes(): Promise<Record<string, number>> {
    return this.get('/api/voice/volumes')
  }

  setVoiceVolume(targetUserId: string, volume: number): Promise<{ targetUserId: string; volume: number }> {
    return this.put(`/api/voice/volumes/${targetUserId}`, { volume })
  }

  resetVoiceVolume(targetUserId: string): Promise<{ targetUserId: string; volume: number }> {
    return this.delete(`/api/voice/volumes/${targetUserId}`)
  }

  logout(refreshTokenValue: string): Promise<{ message: string }> {
    const payload: RefreshTokenRequest = { refreshToken: refreshTokenValue }
    return this.post<{ message: string }>('/api/auth/logout', payload)
  }

  updateProfile(data: UpdateProfileInput): Promise<User> {
    return this.patch<User>('/api/auth/profile', data)
  }

  async uploadAvatar(file: File): Promise<User> {
    return this.fetchWithFormData<User>('/api/auth/avatar', 'avatar', file)
  }

  deleteAvatar(): Promise<User> {
    return this.delete<User>('/api/auth/avatar')
  }

  changePassword(data: ChangePasswordInput): Promise<{ message: string }> {
    return this.patch<{ message: string }>('/api/auth/password', data)
  }

  changeEmail(data: ChangeEmailInput): Promise<User> {
    return this.patch<User>('/api/auth/email', data)
  }

  updateStatus(status: UserStatus, duration?: StatusDurationPreset): Promise<User> {
    const body: { status: UserStatus; duration?: StatusDurationPreset } = { status }
    if (duration !== undefined) body.duration = duration
    return this.patch<User>('/api/auth/status', body)
  }

  updateCustomStatus(customStatus: string | null): Promise<User> {
    return this.patch<User>('/api/auth/custom-status', { customStatus })
  }

  updatePushPrefs(data: UpdatePushPrefsInput): Promise<User> {
    return this.patch<User>('/api/auth/push-preferences', data)
  }

  getUploadConfig(): Promise<{ maxSizeMb: number }> {
    return this.get('/api/uploads/config')
  }

  private _maxSizeMb: number | null = null
  async getMaxUploadSizeMb(): Promise<number> {
    if (this._maxSizeMb !== null) return this._maxSizeMb
    try {
      const cfg = await this.getUploadConfig()
      this._maxSizeMb = cfg.maxSizeMb
    } catch {
      this._maxSizeMb = 50
    }
    return this._maxSizeMb
  }

  async uploadAttachment(file: File): Promise<Attachment> {
    return this.fetchWithFormData<Attachment>('/api/uploads/attachments', 'file', file)
  }

  private async fetchWithFormData<T>(path: string, fieldName: string, file: File): Promise<T> {
    const formData = new FormData()
    formData.append(fieldName, file)

    const headers: Record<string, string> = {}
    const { accessToken } = readPersistedAuth()
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`
    }

    let res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers,
      body: formData
    })

    if (res.status === 401) {
      const refreshed = await this.tryRefreshToken()
      if (refreshed && !(refreshed as unknown as { _networkError?: boolean })._networkError) {
        headers.Authorization = `Bearer ${refreshed.accessToken}`
        res = await fetch(`${this.baseUrl}${path}`, {
          method: 'POST',
          headers,
          body: formData
        })
      } else if (!refreshed) {
        this.onAuthFailure?.()
      }
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      const msg = typeof body?.message === 'string' ? body.message : 'Upload failed'
      throw new ApiError(msg, res.status, body)
    }

    return (await res.json()) as T
  }

  toggleReaction(
    channelId: string,
    messageId: string,
    emoji: string,
    isCustom = false
  ): Promise<{ action: 'added' | 'removed' }> {
    return this.post(`/api/channels/${channelId}/messages/${messageId}/reactions`, { emoji, isCustom })
  }

  getPinnedMessages(channelId: string): Promise<Message[]> {
    return this.get(`/api/channels/${channelId}/messages/pinned`)
  }

  getPinnedDmMessages(conversationId: string): Promise<Message[]> {
    return this.get(`/api/dm/${conversationId}/messages/pinned`)
  }

  getServerInsights(serverId: string): Promise<ServerInsights> {
    return this.get(`/api/servers/${serverId}/insights`)
  }

  getOnboardingConfig(serverId: string): Promise<OnboardingConfig> {
    return this.get(`/api/servers/${serverId}/onboarding`)
  }

  updateOnboardingConfig(serverId: string, data: {
    enabled?: boolean
    message?: string | null
    selfAssignableRoleIds?: string[]
  }): Promise<OnboardingConfig> {
    return this.patch(`/api/servers/${serverId}/onboarding`, data)
  }

  getOnboardingWizard(serverId: string): Promise<{
    onboardingEnabled: boolean
    onboardingMessage: string | null
    name: string
    roles: { id: string; name: string; color: string | null }[]
  }> {
    return this.get(`/api/servers/${serverId}/onboarding/wizard`)
  }

  completeOnboarding(serverId: string, roleIds?: string[]) {
    return this.post(`/api/servers/${serverId}/onboarding/complete`, { roleIds })
  }

  changeSelfRoles(serverId: string, roleIds: string[]) {
    return this.patch(`/api/servers/${serverId}/self-roles`, { roleIds })
  }

  async getSelfAssignableRoles(serverId: string): Promise<{ id: string; name: string; color: string | null }[]> {
    const data = await this.get<{ roles: { id: string; name: string; color: string | null }[] }>(`/api/servers/${serverId}/onboarding/wizard`)
    return data.roles
  }

  getEmojiStats(serverId: string): Promise<EmojiStat[]> {
    return this.get(`/api/servers/${serverId}/emojis/stats`)
  }

  getEmojis(serverId: string): Promise<CustomEmoji[]> {
    return this.get(`/api/servers/${serverId}/emojis`)
  }

  async uploadEmoji(serverId: string, name: string, file: File): Promise<CustomEmoji> {
    const form = new FormData()
    form.append('name', name)
    form.append('image', file)
    const headers: Record<string, string> = {}
    const { accessToken } = readPersistedAuth()
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`
    const res = await fetch(`${this.baseUrl}/api/servers/${serverId}/emojis`, {
      method: 'POST',
      headers,
      body: form
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.message ?? 'Upload failed')
    }
    return res.json()
  }

  renameEmoji(serverId: string, emojiId: string, name: string): Promise<CustomEmoji> {
    return this.patch(`/api/servers/${serverId}/emojis/${emojiId}`, { name })
  }

  async deleteEmoji(serverId: string, emojiId: string): Promise<void> {
    await this.delete(`/api/servers/${serverId}/emojis/${emojiId}`)
  }

  createPoll(
    channelId: string,
    question: string,
    options: string[],
    multiSelect = false,
    expiresAt?: string
  ): Promise<Message> {
    return this.post(`/api/channels/${channelId}/polls`, { question, options, multiSelect, expiresAt })
  }

  votePoll(pollId: string, optionId: string): Promise<{ poll: Poll }> {
    return this.post(`/api/polls/${pollId}/vote`, { optionId })
  }

  getPoll(pollId: string): Promise<Poll> {
    return this.get(`/api/polls/${pollId}`)
  }

  getThreadMessages(
    channelId: string,
    parentId: string,
    opts?: { cursor?: string; after?: string; around?: string; limit?: number }
  ): Promise<{ messages: Message[]; hasMore: boolean; hasNewer?: boolean }> {
    const params = new URLSearchParams()
    if (opts?.cursor) params.set('cursor', opts.cursor)
    if (opts?.after) params.set('after', opts.after)
    if (opts?.around) params.set('around', opts.around)
    if (opts?.limit != null) params.set('limit', String(opts.limit))
    const qs = params.toString()
    return this.get(`/api/channels/${channelId}/messages/${parentId}/thread${qs ? `?${qs}` : ''}`)
  }

  getAutoModRules(serverId: string): Promise<AutoModRule[]> {
    return this.get(`/api/servers/${serverId}/automod`)
  }

  updateAutoModRule(
    serverId: string,
    type: string,
    enabled: boolean,
    config: Record<string, unknown>
  ): Promise<AutoModRule> {
    return this.put(`/api/servers/${serverId}/automod/${type}`, { enabled, config })
  }

  getRoles(serverId: string): Promise<import('@chat/shared').Role[]> {
    return this.get(`/api/servers/${serverId}/roles`)
  }

  createRole(serverId: string, data: { name: string; color?: string; permissions?: string }): Promise<import('@chat/shared').Role> {
    return this.post(`/api/servers/${serverId}/roles`, data)
  }

  updateRole(serverId: string, roleId: string, data: { name?: string; color?: string | null; permissions?: string; position?: number; selfAssignable?: boolean; isAdmin?: boolean }): Promise<import('@chat/shared').Role> {
    return this.patch(`/api/servers/${serverId}/roles/${roleId}`, data)
  }

  deleteRole(serverId: string, roleId: string): Promise<void> {
    return this.delete(`/api/servers/${serverId}/roles/${roleId}`)
  }

  reorderRoles(serverId: string, roleIds: string[]): Promise<void> {
    return this.patch(`/api/servers/${serverId}/roles/reorder`, { roleIds })
  }

  getChannelOverrides(channelId: string): Promise<(import('@chat/shared').ChannelPermissionOverride & { roleName: string })[]> {
    return this.get(`/api/channels/${channelId}/overrides`)
  }

  upsertChannelOverride(serverId: string, channelId: string, roleId: string, allow: string, deny: string): Promise<import('@chat/shared').ChannelPermissionOverride> {
    return this.put(`/api/servers/${serverId}/channels/${channelId}/overrides/${roleId}`, { allow, deny })
  }

  deleteChannelOverride(serverId: string, channelId: string, roleId: string): Promise<void> {
    return this.delete(`/api/servers/${serverId}/channels/${channelId}/overrides/${roleId}`)
  }

  getMyChannelPermissions(serverId: string, channelId: string): Promise<{ permissions: string }> {
    return this.get(`/api/servers/${serverId}/channels/${channelId}/permissions/me`)
  }

  getAllChannelPermissions(serverId: string): Promise<Record<string, string>> {
    return this.get(`/api/servers/${serverId}/channels/permissions/me`)
  }

  assignRoles(serverId: string, userId: string, roleIds: string[]): Promise<unknown> {
    return this.patch(`/api/servers/${serverId}/members/${userId}/roles`, { roleIds })
  }

  createInvite(serverId: string, opts?: { maxUses?: number; expiresInMinutes?: number }): Promise<Invite> {
    return this.post(`/api/servers/${serverId}/invites`, opts)
  }

  getInvites(serverId: string): Promise<Invite[]> {
    return this.get(`/api/servers/${serverId}/invites`)
  }

  deleteInvite(inviteId: string): Promise<void> {
    return this.delete(`/api/invites/${inviteId}`)
  }

  joinViaInvite(code: string): Promise<unknown> {
    return this.post(`/api/invites/${code}/join`)
  }

  resolveVanity(code: string): Promise<{ id: string; name: string; iconUrl: string | null; memberCount: number }> {
    return this.get(`/api/invites/vanity/${code}`)
  }

  joinViaVanity(code: string): Promise<unknown> {
    return this.post(`/api/invites/vanity/${code}/join`)
  }

  toggleBookmark(messageId: string, note?: string): Promise<{ action: 'added' | 'removed'; messageId: string }> {
    return this.post('/api/bookmarks', { messageId, note })
  }

  getBookmarks(cursor?: string): Promise<{ bookmarks: unknown[]; hasMore: boolean }> {
    const params = cursor ? `?cursor=${cursor}` : ''
    return this.get(`/api/bookmarks${params}`)
  }

  getBookmarkIds(): Promise<string[]> {
    return this.get('/api/bookmarks/ids')
  }

  removeBookmark(messageId: string): Promise<void> {
    return this.delete(`/api/bookmarks/${messageId}`)
  }

  searchMessages(
    query: string,
    opts?: {
      serverId?: string
      channelId?: string
      conversationId?: string
      dmOnly?: boolean
      limit?: number
      offset?: number
    }
  ): Promise<{ results: SearchResult[]; total: number }> {
    const params = new URLSearchParams({ q: query })
    if (opts?.serverId) params.set('serverId', opts.serverId)
    if (opts?.channelId) params.set('channelId', opts.channelId)
    if (opts?.conversationId) params.set('conversationId', opts.conversationId)
    if (opts?.dmOnly) params.set('dmOnly', 'true')
    if (opts?.limit) params.set('limit', String(opts.limit))
    if (opts?.offset != null) params.set('offset', String(opts.offset))
    return this.get(`/api/search/messages?${params}`)
  }

  getAllNotifPrefs(): Promise<{ prefs: Record<string, string>; serverPrefs: Record<string, string> }> {
    return this.get('/api/notif-prefs/mine')
  }

  getNotifPref(channelId: string): Promise<{ level: string }> {
    return this.get(`/api/channels/${channelId}/notifications`)
  }

  setNotifPref(channelId: string, level: string): Promise<{ level: string }> {
    return this.request('PUT', `/api/channels/${channelId}/notifications`, {
      level
    })
  }

  resetNotifPref(channelId: string): Promise<{ level: string }> {
    return this.request('DELETE', `/api/channels/${channelId}/notifications`)
  }

  getServerNotifPref(serverId: string): Promise<{ level: string }> {
    return this.get(`/api/servers/${serverId}/notifications`)
  }

  setServerNotifPref(serverId: string, level: string): Promise<{ level: string }> {
    return this.request('PUT', `/api/servers/${serverId}/notifications`, { level })
  }

  resetServerNotifPref(serverId: string): Promise<{ level: string }> {
    return this.request('DELETE', `/api/servers/${serverId}/notifications`)
  }

  getAuditLog(
    serverId: string,
    limit?: number,
    cursor?: string
  ): Promise<{ entries: AuditLogEntry[]; hasMore: boolean }> {
    const params = new URLSearchParams()
    if (limit) params.set('limit', String(limit))
    if (cursor) params.set('cursor', cursor)
    const qs = params.toString()
    return this.get(`/api/servers/${serverId}/audit-log${qs ? `?${qs}` : ''}`)
  }

  createWebhook(channelId: string, name: string): Promise<Webhook> {
    return this.post(`/api/channels/${channelId}/webhooks`, { name })
  }

  getWebhooks(channelId: string): Promise<Webhook[]> {
    return this.get(`/api/channels/${channelId}/webhooks`)
  }

  deleteWebhook(webhookId: string): Promise<void> {
    return this.delete(`/api/webhooks/${webhookId}`)
  }

  updateServer(serverId: string, data: { name?: string; vanityCode?: string | null; welcomeChannelId?: string | null; welcomeMessage?: string | null; afkChannelId?: string | null; afkTimeout?: number }): Promise<unknown> {
    return this.patch(`/api/servers/${serverId}`, data)
  }

  async uploadServerIcon(serverId: string, file: File): Promise<unknown> {
    return this.fetchWithFormData<unknown>(`/api/servers/${serverId}/icon`, 'icon', file)
  }

  deleteServerIcon(serverId: string): Promise<unknown> {
    return this.delete(`/api/servers/${serverId}/icon`)
  }

  deleteServer(serverId: string): Promise<void> {
    return this.request<void>('DELETE', `/api/servers/${serverId}`)
  }

  leaveServer(serverId: string): Promise<void> {
    return this.post(`/api/servers/${serverId}/leave`)
  }

  updateMemberRoles(serverId: string, userId: string, roleIds: string[]): Promise<unknown> {
    return this.patch(`/api/servers/${serverId}/members/${userId}/roles`, {
      roleIds
    })
  }

  kickMember(serverId: string, userId: string): Promise<void> {
    return this.request<void>('DELETE', `/api/servers/${serverId}/members/${userId}`)
  }

  banMember(serverId: string, userId: string, reason?: string): Promise<void> {
    return this.post(`/api/servers/${serverId}/bans/${userId}`, { reason })
  }

  unbanMember(serverId: string, userId: string): Promise<void> {
    return this.request<void>('DELETE', `/api/servers/${serverId}/bans/${userId}`)
  }

  timeoutMember(serverId: string, userId: string, duration: number): Promise<{ mutedUntil: string }> {
    return this.post(`/api/servers/${serverId}/members/${userId}/timeout`, { duration })
  }

  removeTimeout(serverId: string, userId: string): Promise<void> {
    return this.request<void>('DELETE', `/api/servers/${serverId}/members/${userId}/timeout`)
  }

  getBans(serverId: string): Promise<Array<{
    id: string
    userId: string
    user: { id: string; username: string; displayName: string | null; avatarUrl: string | null }
    bannedBy: { id: string; username: string; displayName: string | null }
    reason: string | null
    createdAt: string
  }>> {
    return this.get(`/api/servers/${serverId}/bans`)
  }

  updateChannel(
    serverId: string,
    channelId: string,
    data: {
      name?: string
      position?: number
      categoryId?: string | null
      isArchived?: boolean
      defaultSortOrder?: 'latest_activity' | 'newest'
      defaultLayout?: 'list' | 'grid'
      postGuidelines?: string | null
      requireTags?: boolean
    }
  ): Promise<unknown> {
    return this.patch(`/api/servers/${serverId}/channels/${channelId}`, data)
  }

  getForumTags(channelId: string): Promise<ForumTag[]> {
    return this.get(`/api/channels/${channelId}/tags`)
  }

  createForumTag(channelId: string, data: { name: string; color?: string }): Promise<ForumTag> {
    return this.post(`/api/channels/${channelId}/tags`, data)
  }

  updateForumTag(channelId: string, tagId: string, data: { name?: string; color?: string | null }): Promise<ForumTag> {
    return this.patch(`/api/channels/${channelId}/tags/${tagId}`, data)
  }

  deleteForumTag(channelId: string, tagId: string): Promise<{ id: string; deleted: boolean }> {
    return this.delete(`/api/channels/${channelId}/tags/${tagId}`)
  }

  deleteChannel(serverId: string, channelId: string): Promise<void> {
    return this.request<void>('DELETE', `/api/servers/${serverId}/channels/${channelId}`)
  }

  reorderChannels(serverId: string, channelIds: string[]): Promise<void> {
    return this.patch(`/api/servers/${serverId}/channels/reorder`, {
      channelIds
    })
  }

  createCategory(serverId: string, name: string): Promise<ChannelCategory> {
    return this.post(`/api/servers/${serverId}/categories`, { name })
  }

  updateCategory(serverId: string, categoryId: string, data: { name?: string; position?: number }): Promise<ChannelCategory> {
    return this.patch(`/api/servers/${serverId}/categories/${categoryId}`, data)
  }

  deleteCategory(serverId: string, categoryId: string): Promise<void> {
    return this.request<void>('DELETE', `/api/servers/${serverId}/categories/${categoryId}`)
  }

  reorderCategories(serverId: string, categoryIds: string[]): Promise<void> {
    return this.patch(`/api/servers/${serverId}/categories/reorder`, { categoryIds })
  }

  getDmConversations(): Promise<DmConversation[]> {
    return this.get('/api/dm')
  }

  createDm(recipientId: string): Promise<DmConversation> {
    return this.post('/api/dm', { recipientId })
  }

  createGroupDm(memberIds: string[], groupName?: string): Promise<DmConversation> {
    return this.post('/api/dm/group', { memberIds, groupName })
  }

  getDmConversation(id: string): Promise<DmConversation> {
    return this.get(`/api/dm/${id}`)
  }

  closeDm(conversationId: string): Promise<void> {
    return this.patch(`/api/dm/${conversationId}/close`)
  }

  getDmReadStates(conversationId: string): Promise<{ userId: string; lastReadAt: string }[]> {
    return this.get(`/api/dm/${conversationId}/read-states`)
  }

  getDmMessages(
    conversationId: string,
    cursor?: string,
    limit = 50
  ): Promise<{ messages: Message[]; hasMore: boolean }> {
    const params = new URLSearchParams()
    if (cursor) params.set('cursor', cursor)
    params.set('limit', String(limit))
    const qs = params.toString()
    return this.get(`/api/dm/${conversationId}/messages${qs ? `?${qs}` : ''}`)
  }

  getDmMessagesAfter(
    conversationId: string,
    afterId: string,
    limit = 50
  ): Promise<{ messages: Message[]; hasMore: boolean; hasNewer: boolean }> {
    return this.get(`/api/dm/${conversationId}/messages?after=${afterId}&limit=${limit}`)
  }

  getDmMessagesAround(
    conversationId: string,
    messageId: string,
    limit = 50
  ): Promise<{ messages: Message[]; hasMore: boolean; hasNewer: boolean }> {
    return this.get(`/api/dm/${conversationId}/messages?around=${messageId}&limit=${limit}`)
  }

  getReadStates(): Promise<{
    channels: { channelId: string; serverId: string; mentionCount: number; unreadCount: number; lastReadAt: string }[]
    dms: { conversationId: string; mentionCount: number; unreadCount: number; lastReadAt: string }[]
  }> {
    return this.get('/api/read-states')
  }

  ackServer(serverId: string): Promise<{ ok: boolean }> {
    return this.request('PUT', `/api/servers/${serverId}/ack`)
  }

  ackChannel(channelId: string): Promise<{ ok: boolean }> {
    return this.request('PUT', `/api/channels/${channelId}/ack`)
  }

  ackDm(conversationId: string): Promise<{ ok: boolean }> {
    return this.request('PUT', `/api/dm/${conversationId}/ack`)
  }

  getSessions(): Promise<ActiveSession[]> {
    return this.get('/api/auth/sessions')
  }

  revokeSession(id: string): Promise<{ message: string }> {
    return this.request('DELETE', `/api/auth/sessions/${id}`)
  }

  revokeAllSessions(refreshToken: string): Promise<{ message: string }> {
    return this.request('DELETE', '/api/auth/sessions', { refreshToken })
  }

  getServerEvents(
    serverId: string,
    cursor?: string,
    afterId?: string
  ): Promise<{ events: ServerEvent[]; hasMore: boolean; nextCursor: string | null; nextAfterId: string | null }> {
    const params = new URLSearchParams()
    if (cursor) params.set('cursor', cursor)
    if (afterId) params.set('afterId', afterId)
    const qs = params.toString()
    return this.get(`/api/servers/${serverId}/events${qs ? `?${qs}` : ''}`)
  }

  getServerEvent(serverId: string, eventId: string): Promise<ServerEvent> {
    return this.get(`/api/servers/${serverId}/events/${eventId}`)
  }

  createServerEvent(serverId: string, data: CreateEventInput): Promise<ServerEvent> {
    return this.post(`/api/servers/${serverId}/events`, data)
  }

  updateServerEvent(serverId: string, eventId: string, data: UpdateEventInput): Promise<ServerEvent> {
    return this.put(`/api/servers/${serverId}/events/${eventId}`, data)
  }

  cancelServerEvent(serverId: string, eventId: string): Promise<ServerEvent> {
    return this.post(`/api/servers/${serverId}/events/${eventId}/cancel`)
  }

  toggleEventInterest(
    serverId: string,
    eventId: string
  ): Promise<{ interested: boolean; count: number }> {
    return this.post(`/api/servers/${serverId}/events/${eventId}/interest`)
  }

  getEventInterestedUsers(
    serverId: string,
    eventId: string
  ): Promise<{ userId: string; user: { id: string; username: string; displayName: string | null; avatarUrl: string | null } }[]> {
    return this.get(`/api/servers/${serverId}/events/${eventId}/interested`)
  }

  // Bot management
  createBot(data: { username: string; displayName: string; description?: string; public?: boolean }): Promise<BotApplication & { token: string }> {
    return this.post('/api/bots', data)
  }

  listOwnBots(): Promise<BotApplication[]> {
    return this.get('/api/bots')
  }

  getBot(botId: string): Promise<BotApplication> {
    return this.get(`/api/bots/${botId}`)
  }

  updateBot(botId: string, data: { displayName?: string; description?: string; public?: boolean }): Promise<BotApplication> {
    return this.patch(`/api/bots/${botId}`, data)
  }

  deleteBot(botId: string): Promise<void> {
    return this.delete(`/api/bots/${botId}`)
  }

  regenerateBotToken(botId: string): Promise<{ token: string }> {
    return this.post(`/api/bots/${botId}/regenerate-token`)
  }

  searchBots(query: string): Promise<{ id: string; username: string; displayName: string | null; avatarUrl: string | null }[]> {
    return this.get(`/api/bots/search?q=${encodeURIComponent(query)}`)
  }

  // Server bot management
  addBotToServer(serverId: string, username: string): Promise<unknown> {
    return this.post(`/api/servers/${serverId}/bots`, { username })
  }

  removeBotFromServer(serverId: string, botUserId: string): Promise<void> {
    return this.delete(`/api/servers/${serverId}/bots/${botUserId}`)
  }

  listServerBots(serverId: string): Promise<{
    userId: string
    user: { id: string; username: string; displayName: string | null; avatarUrl: string | null; isBot: boolean }
    joinedAt: string
    roles: { id: string; name: string; color: string | null }[]
  }[]> {
    return this.get(`/api/servers/${serverId}/bots`)
  }

  // Bot commands
  getServerBotCommands(serverId: string, channelId?: string): Promise<BotCommandWithBot[]> {
    const qs = channelId ? `?channelId=${channelId}` : ''
    return this.get(`/api/servers/${serverId}/bot-commands${qs}`)
  }

  getBotUserCommands(botUserId: string): Promise<BotCommandWithBot[]> {
    return this.get(`/api/bots/user/${botUserId}/commands`)
  }

  getInAppNotifications(params?: { limit?: number; cursor?: string }): Promise<{
    items: InAppNotificationDto[]
    nextCursor?: string
  }> {
    const qs = new URLSearchParams()
    if (params?.limit) qs.set('limit', String(params.limit))
    if (params?.cursor) qs.set('cursor', params.cursor)
    const s = qs.toString()
    return this.get(`/api/notifications${s ? `?${s}` : ''}`)
  }

  getInAppNotificationUnreadCount(): Promise<{ count: number }> {
    return this.get('/api/notifications/unread-count')
  }

  markInAppNotificationRead(id: string): Promise<InAppNotificationDto> {
    return this.patch(`/api/notifications/${id}/read`, {})
  }

  markAllInAppNotificationsRead(): Promise<{ updated: number }> {
    return this.post('/api/notifications/read-all', {})
  }
}
