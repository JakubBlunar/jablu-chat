import type { User } from '@chat/shared'
import { useAuthStore } from './auth.store'
import { cleanupSession } from './sessionCleanup'

jest.mock('../lib/api', () => ({
  api: {
    login: jest.fn(),
    register: jest.fn(),
    logout: jest.fn(),
    refreshToken: jest.fn(),
    getProfile: jest.fn(),
    updateProfile: jest.fn(),
    changePassword: jest.fn(),
    changeEmail: jest.fn(),
    updateStatus: jest.fn(),
    updateCustomStatus: jest.fn(),
    updateDmPrivacy: jest.fn(),
    updatePushPrefs: jest.fn(),
    uploadAvatar: jest.fn(),
    deleteAvatar: jest.fn()
  }
}))

jest.mock('../lib/notifications', () => ({
  unsubscribeFromPush: jest.fn().mockResolvedValue(undefined)
}))

// Test auth's awaited boundary here; sessionCleanup.test exercises every real
// cleanup step without loading browser realtime/media dependencies.
jest.mock('./sessionCleanup', () => ({ cleanupSession: jest.fn() }))

import { api } from '../lib/api'

const mockUser: User = {
  id: 'user-1',
  username: 'testuser',
  displayName: null,
  email: 'test@example.com',
  avatarUrl: null,
  bio: null,
  status: 'online',
  manualStatus: null,
  manualStatusExpiresAt: null,
  customStatus: null,
  dmPrivacy: 'everyone',
  pushSuppressAll: false,
  pushQuietHoursEnabled: false,
  pushQuietHoursTz: null,
  pushQuietHoursStartMin: 1320,
  pushQuietHoursEndMin: 480,
  activityShareEnabled: false,
  activityShareOnline: false,
  activityDefaultSharing: 'friends_all',
  activityShareGames: true,
  activityShareMusic: true,
  lastSeenAt: null,
  createdAt: '2025-01-01T00:00:00Z'
}

function resetStore() {
  useAuthStore.setState({
    user: null,
    accessToken: null,
    refreshToken: null,
    isAuthenticated: false,
    isLoading: false,
    isManualStatus: false
  })
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function signIn() {
  useAuthStore.setState({
    user: mockUser,
    accessToken: 'at-1',
    refreshToken: 'rt-1',
    isAuthenticated: true,
    isManualStatus: true
  })
}

beforeEach(() => {
  resetStore()
  jest.clearAllMocks()
  localStorage.clear()
  jest.mocked(cleanupSession).mockResolvedValue(undefined)
  jest.mocked(api.logout).mockResolvedValue({ message: 'ok' })
})

describe('auth.store', () => {
  describe('login', () => {
    it('stores tokens and user on success', async () => {
      jest.mocked(api.login).mockResolvedValueOnce({
        accessToken: 'at-1',
        refreshToken: 'rt-1',
        user: mockUser
      })

      await useAuthStore.getState().login('test@example.com', 'pass')

      const state = useAuthStore.getState()
      expect(state.accessToken).toBe('at-1')
      expect(state.refreshToken).toBe('rt-1')
      expect(state.user!.username).toBe('testuser')
      expect(state.isAuthenticated).toBe(true)
    })
  })

  describe('register', () => {
    it('stores tokens and user on success', async () => {
      jest.mocked(api.register).mockResolvedValueOnce({
        accessToken: 'at-2',
        refreshToken: 'rt-2',
        user: mockUser
      })

      await useAuthStore.getState().register('testuser', 'test@example.com', 'pass')

      expect(useAuthStore.getState().isAuthenticated).toBe(true)
    })
  })

  describe('logout', () => {
    it('clears auth state', async () => {
      useAuthStore.setState({
        user: mockUser,
        accessToken: 'at-1',
        refreshToken: 'rt-1',
        isAuthenticated: true
      })
      jest.mocked(api.logout).mockResolvedValueOnce({ message: 'ok' })

      await useAuthStore.getState().logout()

      const state = useAuthStore.getState()
      expect(state.user).toBeNull()
      expect(state.accessToken).toBeNull()
      expect(state.refreshToken).toBeNull()
      expect(state.isAuthenticated).toBe(false)
    })

    it('clears state even when API call fails', async () => {
      useAuthStore.setState({
        user: mockUser,
        accessToken: 'at-1',
        refreshToken: 'rt-1',
        isAuthenticated: true
      })
      jest.mocked(api.logout).mockRejectedValueOnce(new Error('fail'))

      await useAuthStore.getState().logout()

      expect(useAuthStore.getState().isAuthenticated).toBe(false)
    })
  })

  describe('session cleanup', () => {
    it('awaits cleanup after clearing auth and manual presence', async () => {
      signIn()
      const started = deferred<void>()
      const cleanup = deferred<void>()
      jest.mocked(cleanupSession).mockImplementationOnce(() => {
        started.resolve()
        return cleanup.promise
      })
      let finished = false
      const logout = useAuthStore.getState().logout().then(() => { finished = true })
      await started.promise

      expect(useAuthStore.getState()).toMatchObject({ user: null, isManualStatus: false })
      expect(finished).toBe(false)
      cleanup.resolve()
      await logout
      expect(finished).toBe(true)
    })

    it('surfaces cleanup failures without restoring the ended session', async () => {
      signIn()
      const error = new AggregateError([new Error('cache')], 'Session cleanup failed')
      jest.mocked(cleanupSession).mockRejectedValueOnce(error)

      await expect(useAuthStore.getState().logout()).rejects.toBe(error)
      expect(useAuthStore.getState()).toMatchObject({
        user: null, accessToken: null, refreshToken: null, isAuthenticated: false, isManualStatus: false
      })
    })

    it('does not publish a new login while an old disk purge is in flight', async () => {
      signIn()
      const started = deferred<void>()
      const cleanup = deferred<void>()
      jest.mocked(cleanupSession).mockImplementationOnce(() => {
        started.resolve()
        return cleanup.promise
      })
      const logout = useAuthStore.getState().logout()
      await started.promise

      jest.mocked(api.login).mockResolvedValueOnce({
        accessToken: 'bob-at', refreshToken: 'bob-rt', user: { ...mockUser, id: 'bob' }
      })
      const login = useAuthStore.getState().login('bob@example.com', 'pass')
      await Promise.resolve()
      expect(useAuthStore.getState().user).toBeNull()
      expect(jest.mocked(cleanupSession).mock.calls[0][0]()).toBe(true)

      cleanup.resolve()
      await Promise.all([logout, login])
      expect(useAuthStore.getState().user?.id).toBe('bob')
    })

    it('does not let a delayed logout clear a newer login', async () => {
      signIn()
      const remoteLogout = deferred<{ message: string }>()
      jest.mocked(api.logout).mockReturnValueOnce(remoteLogout.promise)
      const logout = useAuthStore.getState().logout()
      jest.mocked(api.login).mockResolvedValueOnce({
        accessToken: 'bob-at', refreshToken: 'bob-rt', user: { ...mockUser, id: 'bob' }
      })
      await useAuthStore.getState().login('bob@example.com', 'pass')
      expect(cleanupSession).toHaveBeenCalledTimes(1)

      remoteLogout.resolve({ message: 'ok' })
      await logout
      expect(useAuthStore.getState().user?.id).toBe('bob')
      expect(cleanupSession).toHaveBeenCalledTimes(1)
    })

    it('still ends the session if a newer login attempt fails during revocation', async () => {
      signIn()
      const remoteLogout = deferred<{ message: string }>()
      jest.mocked(api.logout).mockReturnValueOnce(remoteLogout.promise)
      const logout = useAuthStore.getState().logout()
      jest.mocked(api.login).mockRejectedValueOnce(new Error('bad credentials'))
      await expect(useAuthStore.getState().login('bob@example.com', 'wrong')).rejects.toThrow('bad credentials')
      remoteLogout.resolve({ message: 'ok' })
      await logout
      expect(useAuthStore.getState().user).toBeNull()
      expect(cleanupSession).toHaveBeenCalledTimes(1)
    })

    it('bounds remote revocation without timing out local cleanup', async () => {
      jest.useFakeTimers()
      try {
        signIn()
        jest.mocked(api.logout).mockReturnValueOnce(new Promise(() => {}))
        const cleanup = deferred<void>()
        jest.mocked(cleanupSession).mockReturnValueOnce(cleanup.promise)
        let finished = false
        const logout = useAuthStore.getState().logout().then(() => { finished = true })
        await jest.advanceTimersByTimeAsync(5000)
        expect(finished).toBe(false)
        expect(useAuthStore.getState().user).toBeNull()
        cleanup.resolve()
        await logout
        expect(finished).toBe(true)
        expect(jest.getTimerCount()).toBe(0)
      } finally {
        jest.useRealTimers()
      }
    })

    it('invalidates remaining cleanup steps if the session is replaced externally', async () => {
      signIn()
      const started = deferred<void>()
      const cleanup = deferred<void>()
      jest.mocked(cleanupSession).mockImplementationOnce(() => {
        started.resolve()
        return cleanup.promise
      })
      const logout = useAuthStore.getState().logout()
      await started.promise
      const isCurrent = jest.mocked(cleanupSession).mock.calls[0][0]
      expect(isCurrent()).toBe(true)

      useAuthStore.setState({ user: { ...mockUser, id: 'bob' }, accessToken: 'bob-at', isAuthenticated: true })
      expect(isCurrent()).toBe(false)
      cleanup.resolve()
      await logout
      expect(useAuthStore.getState().user?.id).toBe('bob')
    })
  })

  describe('checkAuth', () => {
    it('sets isAuthenticated false when no tokens exist', async () => {
      useAuthStore.setState({ accessToken: null, refreshToken: null, isLoading: false })
      await useAuthStore.getState().checkAuth()

      const state = useAuthStore.getState()
      expect(state.isAuthenticated).toBe(false)
      expect(state.isLoading).toBe(false)
    })

    it('fetches profile when tokens exist', async () => {
      useAuthStore.setState({ accessToken: 'at-1', refreshToken: 'rt-1' })
      jest.mocked(api.getProfile).mockResolvedValueOnce(mockUser)

      await useAuthStore.getState().checkAuth()

      const state = useAuthStore.getState()
      expect(state.isAuthenticated).toBe(true)
      expect(state.user!.username).toBe('testuser')
      expect(state.isLoading).toBe(false)
    })

    it('attempts refresh on 401 and succeeds', async () => {
      useAuthStore.setState({ accessToken: 'at-old', refreshToken: 'rt-old' })
      jest.mocked(api.getProfile).mockRejectedValueOnce({ status: 401 })
      jest.mocked(api.refreshToken).mockResolvedValueOnce({
        accessToken: 'at-new',
        refreshToken: 'rt-new',
        user: mockUser
      })

      await useAuthStore.getState().checkAuth()

      const state = useAuthStore.getState()
      expect(state.accessToken).toBe('at-new')
      expect(state.isAuthenticated).toBe(true)
    })

    it('clears auth on 401 when refresh also fails with 401', async () => {
      useAuthStore.setState({ accessToken: 'at-old', refreshToken: 'rt-old' })
      jest.mocked(api.getProfile).mockRejectedValueOnce({ status: 401 })
      jest.mocked(api.refreshToken).mockRejectedValueOnce({ status: 401 })

      await useAuthStore.getState().checkAuth()

      const state = useAuthStore.getState()
      expect(state.isAuthenticated).toBe(false)
      expect(state.accessToken).toBeNull()
      expect(state.refreshToken).toBeNull()
      expect(cleanupSession).toHaveBeenCalledTimes(1)
    })

    it('exposes cleanup failure when authentication is lost', async () => {
      signIn()
      jest.mocked(api.getProfile).mockRejectedValueOnce({ status: 401 })
      jest.mocked(api.refreshToken).mockRejectedValueOnce({ status: 403 })
      const error = new Error('cleanup failed')
      jest.mocked(cleanupSession).mockRejectedValueOnce(error)

      await expect(useAuthStore.getState().checkAuth()).rejects.toBe(error)
      expect(useAuthStore.getState().user).toBeNull()
    })

    it('clears orphaned session state when tokens are missing', async () => {
      useAuthStore.setState({ user: mockUser, isAuthenticated: true, isManualStatus: true })
      await useAuthStore.getState().checkAuth()
      expect(cleanupSession).toHaveBeenCalledTimes(1)
      expect(useAuthStore.getState()).toMatchObject({ user: null, isManualStatus: false, isLoading: false })
    })

    it('does not let an old auth check invalidate a new login', async () => {
      signIn()
      const profile = deferred<User>()
      jest.mocked(api.getProfile).mockReturnValueOnce(profile.promise)
      const check = useAuthStore.getState().checkAuth()
      jest.mocked(api.login).mockResolvedValueOnce({
        accessToken: 'bob-at', refreshToken: 'bob-rt', user: { ...mockUser, id: 'bob' }
      })
      await useAuthStore.getState().login('bob@example.com', 'pass')
      profile.reject({ status: 401 })
      await check
      expect(api.refreshToken).not.toHaveBeenCalled()
      expect(useAuthStore.getState().user?.id).toBe('bob')
      expect(cleanupSession).toHaveBeenCalledTimes(1)
    })

    it('keeps auth state on non-auth errors (e.g. 500)', async () => {
      useAuthStore.setState({ accessToken: 'at-1', refreshToken: 'rt-1', isAuthenticated: true })
      jest.mocked(api.getProfile).mockRejectedValueOnce({ status: 500 })

      await useAuthStore.getState().checkAuth()

      expect(useAuthStore.getState().isLoading).toBe(false)
      expect(useAuthStore.getState().accessToken).toBe('at-1')
    })

    it('reads tokens from localStorage as fallback', async () => {
      localStorage.setItem('chat-auth', JSON.stringify({
        state: { accessToken: 'at-ls', refreshToken: 'rt-ls' }
      }))
      jest.mocked(api.getProfile).mockResolvedValueOnce(mockUser)

      await useAuthStore.getState().checkAuth()

      expect(useAuthStore.getState().isAuthenticated).toBe(true)
    })
  })

  describe('refreshSession', () => {
    it('cleans up on a terminal refresh rejection, but preserves the API error', async () => {
      signIn()
      const error = { status: 401 }
      jest.mocked(api.refreshToken).mockRejectedValueOnce(error)
      await expect(useAuthStore.getState().refreshSession()).rejects.toBe(error)
      expect(cleanupSession).toHaveBeenCalledTimes(1)
      expect(useAuthStore.getState().user).toBeNull()
    })

    it('preserves the account and caches on a transient refresh failure', async () => {
      signIn()
      const error = { status: 500 }
      jest.mocked(api.refreshToken).mockRejectedValueOnce(error)
      await expect(useAuthStore.getState().refreshSession()).rejects.toBe(error)
      expect(cleanupSession).not.toHaveBeenCalled()
      expect(useAuthStore.getState().user?.id).toBe(mockUser.id)
    })

    it('does not resurrect an account after logout', async () => {
      signIn()
      const response = { accessToken: 'old-at', refreshToken: 'old-rt', user: mockUser }
      const refresh = deferred<typeof response>()
      jest.mocked(api.refreshToken).mockReturnValueOnce(refresh.promise)
      const refreshing = useAuthStore.getState().refreshSession()
      await useAuthStore.getState().logout()
      refresh.resolve(response)
      await refreshing
      expect(useAuthStore.getState().user).toBeNull()
    })
  })

  describe('updateStatus', () => {
    it('sets isManualStatus when server returns manual presence', async () => {
      jest.mocked(api.updateStatus).mockResolvedValueOnce({
        ...mockUser,
        status: 'dnd',
        manualStatus: 'dnd',
        manualStatusExpiresAt: new Date(Date.now() + 3600_000).toISOString()
      })
      await useAuthStore.getState().updateStatus('dnd', '1h')
      expect(jest.mocked(api.updateStatus)).toHaveBeenCalledWith('dnd', '1h')
      expect(useAuthStore.getState().isManualStatus).toBe(true)
    })

    it('sets isManualStatus to false for online status', async () => {
      useAuthStore.setState({ isManualStatus: true })
      jest.mocked(api.updateStatus).mockResolvedValueOnce({
        ...mockUser,
        status: 'online',
        manualStatus: null,
        manualStatusExpiresAt: null
      })
      await useAuthStore.getState().updateStatus('online')
      expect(useAuthStore.getState().isManualStatus).toBe(false)
    })
  })
})
