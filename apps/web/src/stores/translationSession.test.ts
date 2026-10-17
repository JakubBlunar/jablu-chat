import type { User } from '@chat/shared'
import { useAuthStore } from './auth.store'
import { useTranslationStore } from './translation.store'

jest.mock('@/lib/api', () => ({ api: {} }))
jest.mock('@/lib/notifications', () => ({ unsubscribeFromPush: jest.fn() }))

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
  useAuthStore.setState({ user })
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
