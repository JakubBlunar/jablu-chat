import { getNotifSettings, saveNotifSettings, showNotification, playSound, requestPermission } from './notifications'

let mockAuthenticated = true
jest.mock('@/stores/auth.store', () => ({
  useAuthStore: { getState: () => ({ isAuthenticated: mockAuthenticated, accessToken: 'token' }) }
}))

jest.mock('@/lib/sounds', () => ({
  playNotifSound: jest.fn(),
}))

jest.mock('@/stores/toast.store', () => ({
  showToast: jest.fn(),
}))

import { playNotifSound } from '@/lib/sounds'
import { showToast } from '@/stores/toast.store'
import { useSettingsStore } from '@/stores/settings.store'

const mockPlayNotifSound = jest.mocked(playNotifSound)
const mockShowToast = jest.mocked(showToast)

beforeEach(async () => {
  jest.clearAllMocks()
  mockAuthenticated = true
  localStorage.clear()
  await useSettingsStore.persist.rehydrate()
  useSettingsStore.setState({ notifEnabled: true, notifSoundEnabled: true })
})

describe('getNotifSettings', () => {
  it('returns defaults when nothing stored', () => {
    const settings = getNotifSettings()
    expect(settings).toEqual({ enabled: true, soundEnabled: true })
  })

  it('returns stored settings merged with defaults', () => {
    useSettingsStore.setState({ notifSoundEnabled: false })

    const settings = getNotifSettings()
    expect(settings.enabled).toBe(true)
    expect(settings.soundEnabled).toBe(false)
  })
})

describe('saveNotifSettings', () => {
  it('persists partial settings merged with current', () => {
    saveNotifSettings({ soundEnabled: false })

    expect(useSettingsStore.getState().notifEnabled).toBe(true)
    expect(useSettingsStore.getState().notifSoundEnabled).toBe(false)
  })
})

describe('showNotification', () => {
  it('ignores a late notification after logout', async () => {
    jest.spyOn(document, 'hasFocus').mockReturnValue(true)
    showNotification('Old account', 'Body')
    mockAuthenticated = false
    await Promise.resolve()
    expect(mockShowToast).not.toHaveBeenCalled()
    mockPlayNotifSound.mockClear()
    showNotification('Logged out', 'Body')
    expect(mockPlayNotifSound).not.toHaveBeenCalled()
  })
  it('does nothing when notifications disabled', () => {
    saveNotifSettings({ enabled: false })

    showNotification('Title', 'Body')

    expect(mockShowToast).not.toHaveBeenCalled()
    expect(mockPlayNotifSound).not.toHaveBeenCalled()
  })

  it('shows toast and plays sound when document has focus', async () => {
    jest.spyOn(document, 'hasFocus').mockReturnValue(true)

    showNotification('Title', 'Body', '/url')

    await new Promise((r) => setTimeout(r, 10))
    expect(mockShowToast).toHaveBeenCalledWith('Title', 'Body', '/url')
    expect(mockPlayNotifSound).toHaveBeenCalledWith('message')
  })

  it('uses custom sound kind', () => {
    jest.spyOn(document, 'hasFocus').mockReturnValue(true)

    showNotification('T', 'B', undefined, undefined, 'mention')

    expect(mockPlayNotifSound).toHaveBeenCalledWith('mention')
  })

  it('does not play sound when soundEnabled is false', () => {
    jest.spyOn(document, 'hasFocus').mockReturnValue(true)
    saveNotifSettings({ soundEnabled: false })

    showNotification('T', 'B')

    expect(mockPlayNotifSound).not.toHaveBeenCalled()
  })

  it('uses Electron API when available and not focused', () => {
    jest.spyOn(document, 'hasFocus').mockReturnValue(false)
    const mockElectron = { showNotification: jest.fn() }
    ;(window as any).electronAPI = mockElectron

    showNotification('T', 'B', '/url')

    // The tag is what lets the OS collapse the desktop toast and the web push
    // toast for the same target into one.
    expect(mockElectron.showNotification).toHaveBeenCalledWith('T', 'B', '/url', 'jablu-/url')
    delete (window as any).electronAPI
  })

  it('falls back to Web Notification API', () => {
    jest.spyOn(document, 'hasFocus').mockReturnValue(false)
    const MockNotification = jest.fn()
    Object.defineProperty(MockNotification, 'permission', { value: 'granted', configurable: true })
    ;(window as any).Notification = MockNotification

    showNotification('Title', 'Body')

    expect(MockNotification).toHaveBeenCalledWith('Title', expect.objectContaining({ body: 'Body' }))
  })

  it('uses persistent notifications when a mobile browser rejects the constructor', async () => {
    jest.spyOn(document, 'hasFocus').mockReturnValue(false)
    const mobileNotification = jest.fn(() => { throw new TypeError('Use ServiceWorkerRegistration.showNotification') })
    Object.defineProperty(mobileNotification, 'permission', { value: 'granted', configurable: true })
    Object.defineProperty(window, 'Notification', { configurable: true, value: mobileNotification })
    const showPersistent = jest.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true, value: { getRegistration: jest.fn().mockResolvedValue({ showNotification: showPersistent }) }
    })
    try {
      showNotification('Title', 'Body', '/channels/@me/chat')
      await Promise.resolve()
      expect(showPersistent).toHaveBeenCalledWith('Title', expect.objectContaining({
        body: 'Body', data: { url: '/channels/@me/chat' }
      }))
    } finally {
      Reflect.deleteProperty(navigator, 'serviceWorker')
    }
  })
})

describe('playSound', () => {
  it('plays sound when enabled', () => {
    playSound('message')
    expect(mockPlayNotifSound).toHaveBeenCalledWith('message')
  })

  it('does not play sound when disabled', () => {
    saveNotifSettings({ soundEnabled: false })

    playSound('message')

    expect(mockPlayNotifSound).not.toHaveBeenCalled()
  })
})

describe('requestPermission', () => {
  it('returns true when already granted', async () => {
    Object.defineProperty(Notification, 'permission', { value: 'granted', configurable: true })

    expect(await requestPermission()).toBe(true)
  })

  it('returns false when denied', async () => {
    Object.defineProperty(Notification, 'permission', { value: 'denied', configurable: true })

    expect(await requestPermission()).toBe(false)
  })
})
