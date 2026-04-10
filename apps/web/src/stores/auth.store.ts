import type {
  AuthResponse,
  ChangeEmailInput,
  ChangePasswordInput,
  DmPrivacy,
  StatusDurationPreset,
  UpdateProfileInput,
  UpdatePushPrefsInput,
  User,
  UserStatus
} from '@chat/shared'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { api } from '../lib/api'
import { unsubscribeFromPush } from '../lib/notifications'

export type AuthUser = User

function normalizeAuthUser(raw: User | AuthResponse['user']): AuthUser {
  const r = raw as User
  return {
    ...r,
    manualStatus: r.manualStatus ?? null,
    manualStatusExpiresAt: r.manualStatusExpiresAt ?? null,
    status: r.status as UserStatus,
    dmPrivacy: (r.dmPrivacy as DmPrivacy) ?? 'everyone',
    pushSuppressAll: r.pushSuppressAll ?? false,
    pushQuietHoursEnabled: r.pushQuietHoursEnabled ?? false,
    pushQuietHoursTz: r.pushQuietHoursTz ?? null,
    pushQuietHoursStartMin: r.pushQuietHoursStartMin ?? 22 * 60,
    pushQuietHoursEndMin: r.pushQuietHoursEndMin ?? 8 * 60
  }
}

function manualPresenceActive(user: AuthUser | null): boolean {
  if (!user?.manualStatus) return false
  if (!user.manualStatusExpiresAt) return true
  return new Date(user.manualStatusExpiresAt) > new Date()
}

function resetAllStores() {
  Promise.all([
    import('./server.store'),
    import('./channel.store'),
    import('./member.store'),
    import('./message.store'),
    import('./dm.store'),
    import('./readState.store'),
    import('./notifPref.store'),
    import('./voice.store'),
    import('./voice-connection.store'),
    import('./layout.store'),
    import('./navigation.store'),
    import('./event.store'),
    import('./channel-permissions.store')
  ]).then(
    ([
      { useServerStore },
      { useChannelStore },
      { useMemberStore },
      { useMessageStore },
      { useDmStore },
      { useReadStateStore },
      { useNotifPrefStore },
      { useVoiceStore },
      { useVoiceConnectionStore },
      { useLayoutStore },
      { useNavigationStore },
      { useEventStore },
      { useChannelPermissionsStore }
    ]) => {
      useServerStore.setState({ servers: [], currentServerId: null, viewMode: 'server', isLoading: false })
      useChannelStore.setState({ channels: [], categories: [], currentChannelId: null, isLoading: false, loadedServerId: null })
      useMemberStore.setState({ members: [], onlineUserIds: new Set(), isLoading: false })
      useMessageStore.getState().clearMessages()
      useDmStore.setState({
        conversations: [],
        currentConversationId: null,
        messages: [],
        hasMore: false,
        hasNewer: false,
        isLoading: false,
        isConversationsLoading: false,
        loadedForConvId: null,
        scrollToMessageId: null,
        scrollRequestNonce: 0
      })
      useReadStateStore.setState({ channels: new Map(), dms: new Map(), channelToServer: new Map() })
      useNotifPrefStore.setState({ prefs: {}, serverPrefs: {} })
      useVoiceStore.getState().reset()
      useVoiceConnectionStore.getState().disconnect()
      useLayoutStore.setState({ navDrawerOpen: false, memberDrawerOpen: false })
      useNavigationStore.setState({ isNavigating: false, navigatingToServerId: null, activeNavId: 0 })
      useEventStore.getState().reset()
      useChannelPermissionsStore.getState().clear()
    }
  )
}

type AuthState = {
  user: AuthUser | null
  accessToken: string | null
  refreshToken: string | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (username: string, email: string, password: string, inviteCode?: string) => Promise<void>
  logout: () => Promise<void>
  refreshSession: () => Promise<void>
  checkAuth: () => Promise<void>
  updateProfile: (data: UpdateProfileInput) => Promise<void>
  uploadAvatar: (file: File) => Promise<void>
  deleteAvatar: () => Promise<void>
  changePassword: (data: ChangePasswordInput) => Promise<void>
  changeEmail: (data: ChangeEmailInput) => Promise<void>
  updateStatus: (status: UserStatus, duration?: StatusDurationPreset) => Promise<void>
  updateCustomStatus: (customStatus: string | null) => Promise<void>
  updateDmPrivacy: (dmPrivacy: DmPrivacy) => Promise<void>
  updatePushPrefs: (data: UpdatePushPrefsInput) => Promise<void>
  setUser: (user: AuthUser) => void
  isManualStatus: boolean
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: true,
      isManualStatus: false,

      login: async (email, password) => {
        const data = await api.login(email, password)
        const u = normalizeAuthUser(data.user)
        set({
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          user: u,
          isAuthenticated: true,
          isManualStatus: manualPresenceActive(u)
        })
      },

      register: async (username, email, password, inviteCode?) => {
        const data = await api.register(username, email, password, inviteCode)
        const u = normalizeAuthUser(data.user)
        set({
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          user: u,
          isAuthenticated: true,
          isManualStatus: manualPresenceActive(u)
        })
      },

      logout: async () => {
        const rt = get().refreshToken
        const at = get().accessToken
        const cleanup = async () => {
          if (at) await unsubscribeFromPush(at).catch(() => {})
          if (rt) await api.logout(rt).catch(() => {})
        }
        try {
          await Promise.race([cleanup(), new Promise((r) => setTimeout(r, 5000))])
        } finally {
          set({
            user: null,
            accessToken: null,
            refreshToken: null,
            isAuthenticated: false
          })
          resetAllStores()
        }
      },

      refreshSession: async () => {
        let rt = get().refreshToken
        if (!rt) {
          try {
            const raw = localStorage.getItem('chat-auth')
            if (raw) rt = (JSON.parse(raw) as { state?: { refreshToken?: string } }).state?.refreshToken ?? null
          } catch { /* ignore */ }
        }
        if (!rt) return
        const data = await api.refreshToken(rt)
        const u = normalizeAuthUser(data.user)
        set({
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          user: u,
          isAuthenticated: true,
          isManualStatus: manualPresenceActive(u)
        })
      },

      updateProfile: async (data) => {
        const user = await api.updateProfile(data)
        const u = normalizeAuthUser(user)
        set({ user: u, isManualStatus: manualPresenceActive(u) })
        const { useMemberStore } = await import('@/stores/member.store')
        useMemberStore.getState().updateUserProfile(u.id, u)
      },

      uploadAvatar: async (file) => {
        const user = await api.uploadAvatar(file)
        const u = normalizeAuthUser(user)
        set({ user: u, isManualStatus: manualPresenceActive(u) })
        const { useMemberStore } = await import('@/stores/member.store')
        useMemberStore.getState().updateUserProfile(u.id, u)
      },

      deleteAvatar: async () => {
        const user = await api.deleteAvatar()
        const u = normalizeAuthUser(user)
        set({ user: u, isManualStatus: manualPresenceActive(u) })
        const { useMemberStore } = await import('@/stores/member.store')
        useMemberStore.getState().updateUserProfile(u.id, u)
      },

      changePassword: async (data) => {
        await api.changePassword(data)
      },

      changeEmail: async (data) => {
        const user = await api.changeEmail(data)
        const u = normalizeAuthUser(user)
        set({ user: u, isManualStatus: manualPresenceActive(u) })
      },

      updateStatus: async (status, duration) => {
        const user = await api.updateStatus(status, duration)
        const u = normalizeAuthUser(user)
        set({ user: u, isManualStatus: manualPresenceActive(u) })
      },

      updateCustomStatus: async (customStatus: string | null) => {
        const user = await api.updateCustomStatus(customStatus)
        const u = normalizeAuthUser(user)
        set({ user: u, isManualStatus: manualPresenceActive(u) })
      },

      updateDmPrivacy: async (dmPrivacy) => {
        const user = await api.updateDmPrivacy(dmPrivacy)
        const u = normalizeAuthUser(user)
        set({ user: u, isManualStatus: manualPresenceActive(u) })
      },

      updatePushPrefs: async (data) => {
        const user = await api.updatePushPrefs(data)
        const u = normalizeAuthUser(user)
        set({ user: u, isManualStatus: manualPresenceActive(u) })
      },

      setUser: (user) => {
        const u = normalizeAuthUser(user)
        set({ user: u, isManualStatus: manualPresenceActive(u) })
      },

      checkAuth: async () => {
        let { accessToken, refreshToken } = get()
        if (!accessToken || !refreshToken) {
          try {
            const raw = localStorage.getItem('chat-auth')
            if (raw) {
              const parsed = (JSON.parse(raw) as { state?: { accessToken?: string; refreshToken?: string } }).state
              accessToken = accessToken || parsed?.accessToken || null
              refreshToken = refreshToken || parsed?.refreshToken || null
            }
          } catch { /* ignore */ }
        }
        set({ isLoading: true })

        if (!accessToken || !refreshToken) {
          set({
            user: null,
            isAuthenticated: false,
            isLoading: false
          })
          return
        }

        try {
          const user = await api.getProfile()
          const u = normalizeAuthUser(user)
          set({
            user: u,
            isAuthenticated: true,
            isLoading: false,
            isManualStatus: manualPresenceActive(u)
          })
        } catch (err: unknown) {
          const status = (err as { status?: number }).status
          if (status && status !== 401 && status !== 403) {
            set({ isLoading: false })
            return
          }
          try {
            const data = await api.refreshToken(refreshToken)
            const u = normalizeAuthUser(data.user)
            set({
              accessToken: data.accessToken,
              refreshToken: data.refreshToken,
              user: u,
              isAuthenticated: true,
              isLoading: false,
              isManualStatus: manualPresenceActive(u)
            })
          } catch (refreshErr: unknown) {
            const rStatus = (refreshErr as { status?: number }).status
            if (rStatus === 401 || rStatus === 403) {
              set({
                user: null,
                accessToken: null,
                refreshToken: null,
                isAuthenticated: false,
                isLoading: false
              })
            } else {
              set({ isLoading: false })
            }
          }
        }
      }
    }),
    {
      name: 'chat-auth',
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        user: state.user,
        isAuthenticated: state.isAuthenticated
      })
    }
  )
)
