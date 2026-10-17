import type { User } from '@chat/shared'
import { useAuthStore } from './auth.store'
import { useTranslationStore } from './translation.store'
import { api, type TranslationCapabilities, type TranslationResult } from '@/lib/api'

jest.mock('@/lib/api', () => ({
  api: {
    logout: jest.fn().mockResolvedValue({ message: 'ok' }),
    getTranslationPreference: jest.fn(),
    getTranslationCapabilities: jest.fn(),
    setTranslationPreference: jest.fn(),
    translateMessage: jest.fn()
  }
}))
jest.mock('@/lib/notifications', () => ({ unsubscribeFromPush: jest.fn().mockResolvedValue(undefined) }))
jest.mock('./sessionCleanup', () => ({ cleanupSession: jest.fn().mockResolvedValue(undefined) }))

const user: User = {
  id: 'alice',
  username: 'alice',
  displayName: null,
  email: 'alice@example.test',
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

beforeEach(() => {
  jest.clearAllMocks()
  localStorage.clear()
  useAuthStore.setState({ user, accessToken: 'alice-at', refreshToken: 'alice-rt', isAuthenticated: true })
  useTranslationStore.getState().reset()
  useTranslationStore.setState({ targetLang: 'cs', preferenceLoaded: true, capabilitiesLoaded: true })
})

it('clears cached language state synchronously when the account changes', () => {
  useAuthStore.setState({ user: { ...user, id: 'bob' } })
  expect(useTranslationStore.getState()).toMatchObject({
    targetLang: null,
    preferenceLoaded: false,
    capabilitiesLoaded: false,
    pending: {},
    translations: {}
  })
})

it('also clears translation state when the session ends', () => {
  useAuthStore.setState({ user: null })
  expect(useTranslationStore.getState().preferenceLoaded).toBe(false)
  expect(useTranslationStore.getState().targetLang).toBeNull()
})

it('retains the cache for profile updates belonging to the same account', () => {
  useAuthStore.setState({ user: { ...user, displayName: 'Alice' } })
  expect(useTranslationStore.getState().targetLang).toBe('cs')
  expect(useTranslationStore.getState().preferenceLoaded).toBe(true)
})

it('retains translation state when only the session tokens rotate', () => {
  useAuthStore.setState({ accessToken: 'alice-at-new', refreshToken: 'alice-rt-new' })
  expect(useTranslationStore.getState().targetLang).toBe('cs')
  expect(useTranslationStore.getState().preferenceLoaded).toBe(true)
})

it('resets translations as part of an awaited logout', async () => {
  await useAuthStore.getState().logout()
  expect(useTranslationStore.getState()).toMatchObject({
    targetLang: null, preferenceLoaded: false, capabilitiesLoaded: false, pending: {}, translations: {}
  })
})

it('ignores every kind of in-flight translation response from the previous account', async () => {
  let finishPreference!: (value: { targetLang: string | null }) => void
  let finishCapabilities!: (value: TranslationCapabilities) => void
  let finishSave!: (value: { targetLang: string | null }) => void
  let finishTranslation!: (value: TranslationResult) => void
  jest.mocked(api.getTranslationPreference).mockReturnValueOnce(
    new Promise((resolve) => { finishPreference = resolve })
  )
  jest.mocked(api.getTranslationCapabilities).mockReturnValueOnce(
    new Promise((resolve) => { finishCapabilities = resolve })
  )
  jest.mocked(api.setTranslationPreference).mockReturnValueOnce(
    new Promise((resolve) => { finishSave = resolve })
  )
  jest.mocked(api.translateMessage).mockReturnValueOnce(
    new Promise((resolve) => { finishTranslation = resolve })
  )
  useTranslationStore.getState().reset()
  const requests = [
    useTranslationStore.getState().loadPreference(),
    useTranslationStore.getState().fetchCapabilities(),
    useTranslationStore.getState().savePreference('cs'),
    useTranslationStore.getState().translate('alice-message', 'cs')
  ]

  useAuthStore.setState({ user: { ...user, id: 'bob' } })
  expect(useTranslationStore.getState()).toMatchObject({ pending: {}, targetLang: null })
  jest.mocked(api.getTranslationPreference).mockResolvedValueOnce({ targetLang: 'de' })
  await useTranslationStore.getState().loadPreference()

  finishPreference({ targetLang: 'cs' })
  finishCapabilities({ enabled: true, languages: [] })
  finishSave({ targetLang: 'cs' })
  finishTranslation({ content: 'old account', targetLang: 'cs', detectedLang: 'en' })
  await Promise.all(requests)

  expect(useTranslationStore.getState()).toMatchObject({
    targetLang: 'de',
    preferenceLoaded: true,
    capabilities: null,
    capabilitiesLoaded: false,
    pending: {},
    translations: {}
  })
})
