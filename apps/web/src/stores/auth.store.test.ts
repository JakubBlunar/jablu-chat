import { useAuthStore } from './auth.store'

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
    uploadAvatar: jest.fn(),
    deleteAvatar: jest.fn()
  }
}))

jest.mock('../lib/notifications', () => ({
  unsubscribeFromPush: jest.fn().mockResolvedValue(undefined)
}))

const noopState = () => ({
  setState: jest.fn(),
  getState: () => ({
    clearMessages: jest.fn(),
    reset: jest.fn(),
    disconnect: jest.fn(),
    clear: jest.fn()
  })
})

jest.mock('./server.store', () => ({ useServerStore: noopState() }))
jest.mock('./channel.store', () => ({ useChannelStore: noopState() }))
jest.mock('./member.store', () => ({ useMemberStore: noopState() }))
jest.mock('./message.store', () => ({ useMessageStore: noopState() }))
jest.mock('./dm.store', () => ({ useDmStore: noopState() }))
jest.mock('./readState.store', () => ({ useReadStateStore: noopState() }))
jest.mock('./notifPref.store', () => ({ useNotifPrefStore: noopState() }))
jest.mock('./voice.store', () => ({ useVoiceStore: noopState() }))
jest.mock('./voice-connection.store', () => ({ useVoiceConnectionStore: noopState() }))
jest.mock('./layout.store', () => ({ useLayoutStore: noopState() }))
jest.mock('./navigation.store', () => ({ useNavigationStore: noopState() }))
jest.mock('./event.store', () => ({ useEventStore: noopState() }))
jest.mock('./channel-permissions.store', () => ({ useChannelPermissionsStore: noopState() }))

import { api } from '../lib/api'

const mockUser = {
  id: 'user-1',
  username: 'testuser',
  displayName: null,
  email: 'test@example.com',
  avatarUrl: null,
  bio: null,
  status: 'online' as const,
  customStatus: null,
  dmPrivacy: 'everyone' as const,
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

beforeEach(() => {
  resetStore()
  jest.clearAllMocks()
  localStorage.clear()
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
        user: mockUser as any,
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
        user: mockUser as any,
        accessToken: 'at-1',
        refreshToken: 'rt-1',
        isAuthenticated: true
      })
      jest.mocked(api.logout).mockRejectedValueOnce(new Error('fail'))

      await useAuthStore.getState().logout()

      expect(useAuthStore.getState().isAuthenticated).toBe(false)
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

  describe('updateStatus', () => {
    it('sets isManualStatus to true for non-online status', async () => {
      jest.mocked(api.updateStatus).mockResolvedValueOnce({ ...mockUser, status: 'dnd' })
      await useAuthStore.getState().updateStatus('dnd' as any)
      expect(useAuthStore.getState().isManualStatus).toBe(true)
    })

    it('sets isManualStatus to false for online status', async () => {
      useAuthStore.setState({ isManualStatus: true })
      jest.mocked(api.updateStatus).mockResolvedValueOnce({ ...mockUser, status: 'online' })
      await useAuthStore.getState().updateStatus('online' as any)
      expect(useAuthStore.getState().isManualStatus).toBe(false)
    })
  })
})
