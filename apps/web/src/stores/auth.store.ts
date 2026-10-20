import type {
  AuthResponse,
  AppLocale,
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
import { useTranslationStore } from './translation.store'
import { cleanupSession } from './sessionCleanup'

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
    pushQuietHoursEndMin: r.pushQuietHoursEndMin ?? 8 * 60,
    locale: r.locale ?? null
  }
}

function manualPresenceActive(user: AuthUser | null): boolean {
  if (!user?.manualStatus) return false
  if (!user.manualStatusExpiresAt) return true
  return new Date(user.manualStatusExpiresAt) > new Date()
}

let sessionRevision = 0
let authAttempt = 0
let pendingCleanup: Promise<void> | undefined

async function clearSession() {
  if (pendingCleanup) return pendingCleanup
  useAuthStore.setState({
    user: null,
    accessToken: null,
    refreshToken: null,
    isAuthenticated: false,
    isLoading: false,
    isManualStatus: false
  })
  const revision = sessionRevision
  const cleanup = cleanupSession(() => sessionRevision === revision)
  pendingCleanup = cleanup
  try {
    await cleanup
  } finally {
    if (pendingCleanup === cleanup) pendingCleanup = undefined
  }
}

async function prepareSession(userId: string, attempt: number, revision?: number): Promise<boolean> {
  // A disk purge already in progress cannot be canceled. Do not publish the
  // next account (and start its persistence/realtime effects) until it settles.
  await pendingCleanup
  if (attempt !== authAttempt || (revision !== undefined && revision !== sessionRevision)) return false
  const previousUser = useAuthStore.getState().user
  if (previousUser && previousUser.id !== userId) {
    await clearSession()
    if (useAuthStore.getState().user) return false
  }
  return attempt === authAttempt
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
  updateLocale: (locale: AppLocale) => Promise<void>
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
        const attempt = ++authAttempt
        const data = await api.login(email, password)
        const u = normalizeAuthUser(data.user)
        if (!(await prepareSession(u.id, attempt))) return
        set({
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          user: u,
          isAuthenticated: true,
          isLoading: false,
          isManualStatus: manualPresenceActive(u)
        })
      },

      register: async (username, email, password, inviteCode?) => {
        const attempt = ++authAttempt
        const data = await api.register(username, email, password, inviteCode)
        const u = normalizeAuthUser(data.user)
        if (!(await prepareSession(u.id, attempt))) return
        set({
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          user: u,
          isAuthenticated: true,
          isLoading: false,
          isManualStatus: manualPresenceActive(u)
        })
      },

      logout: async () => {
        ++authAttempt
        const rt = get().refreshToken
        const at = get().accessToken
        const cleanup = async () => {
          if (at) await unsubscribeFromPush(at).catch(() => {})
          if (rt) await api.logout(rt).catch(() => {})
        }
        let timeout: ReturnType<typeof setTimeout> | undefined
        try {
          const remote = Promise.race([
            cleanup(),
            new Promise<void>((resolve) => {
              timeout = setTimeout(resolve, 5000)
            })
          ])
          // End the local session immediately; a slow revocation must never
          // clear an account that signs in while the request is finishing.
          const [sessionResult, remoteResult] = await Promise.allSettled([clearSession(), remote])
          if (sessionResult.status === 'rejected') throw sessionResult.reason
          if (remoteResult.status === 'rejected') throw remoteResult.reason
        } finally {
          clearTimeout(timeout)
        }
      },

      refreshSession: async () => {
        const revision = sessionRevision
        const attempt = authAttempt
        let rt = get().refreshToken
        if (!rt) {
          try {
            const raw = localStorage.getItem('chat-auth')
            if (raw) rt = (JSON.parse(raw) as { state?: { refreshToken?: string } }).state?.refreshToken ?? null
          } catch {
            /* ignore */
          }
        }
        if (!rt) return
        let data: AuthResponse
        try {
          data = await api.refreshToken(rt)
        } catch (error) {
          const status = (error as { status?: number }).status
          if ((status === 401 || status === 403) && revision === sessionRevision && attempt === authAttempt) {
            await clearSession()
          }
          throw error
        }
        if (revision !== sessionRevision || attempt !== authAttempt) return
        const u = normalizeAuthUser(data.user)
        if (!(await prepareSession(u.id, attempt, revision))) return
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

      updateLocale: async (locale) => {
        const userId = get().user?.id
        if (!userId) throw new Error('Cannot update locale without an authenticated user')
        const user = await api.updateLocale(locale)
        if (get().user?.id !== userId) return
        const u = normalizeAuthUser(user)
        set({ user: u, isManualStatus: manualPresenceActive(u) })
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
        const revision = sessionRevision
        const attempt = authAttempt
        const isCurrent = () => revision === sessionRevision && attempt === authAttempt
        let { accessToken, refreshToken } = get()
        if (!accessToken || !refreshToken) {
          try {
            const raw = localStorage.getItem('chat-auth')
            if (raw) {
              const parsed = (JSON.parse(raw) as { state?: { accessToken?: string; refreshToken?: string } }).state
              accessToken = accessToken || parsed?.accessToken || null
              refreshToken = refreshToken || parsed?.refreshToken || null
            }
          } catch {
            /* ignore */
          }
        }
        set({ isLoading: true })

        if (!accessToken || !refreshToken) {
          await clearSession()
          return
        }

        let u: AuthUser
        let refreshed: AuthResponse | undefined
        try {
          const user = await api.getProfile()
          if (!isCurrent()) return
          u = normalizeAuthUser(user)
        } catch (err: unknown) {
          if (!isCurrent()) return
          const status = (err as { status?: number }).status
          if (status && status !== 401 && status !== 403) {
            set({ isLoading: false })
            return
          }
          try {
            refreshed = await api.refreshToken(refreshToken)
            if (!isCurrent()) return
            u = normalizeAuthUser(refreshed.user)
          } catch (refreshErr: unknown) {
            if (!isCurrent()) return
            const rStatus = (refreshErr as { status?: number }).status
            if (rStatus === 401 || rStatus === 403) {
              await clearSession()
            } else {
              set({ isLoading: false })
            }
            return
          }
        }
        if (!(await prepareSession(u.id, attempt, revision))) return
        set({
          ...(refreshed && { accessToken: refreshed.accessToken, refreshToken: refreshed.refreshToken }),
          user: u,
          isAuthenticated: true,
          isLoading: false,
          isManualStatus: manualPresenceActive(u)
        })
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

useAuthStore.subscribe((state, previous) => {
  if (
    state.user?.id !== previous.user?.id ||
    Boolean(state.accessToken) !== Boolean(previous.accessToken) ||
    Boolean(state.refreshToken) !== Boolean(previous.refreshToken) ||
    state.isAuthenticated !== previous.isAuthenticated
  )
    sessionRevision++
  if (state.user?.id !== previous.user?.id) useTranslationStore.getState().reset()
})
