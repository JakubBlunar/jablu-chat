import { clearNotifications, getNotifSettings, saveNotifSettings, showNotification, playSound, requestPermission } from './notifications'

let mockAuthenticated = true
let mockSuppressAll: boolean | null = null
let mockStatus: 'online' | 'dnd' = 'online'
jest.mock('@/stores/auth.store', () => ({
  useAuthStore: { getState: () => ({
    isAuthenticated: mockAuthenticated,
    accessToken: 'token',
    user: { pushSuppressAll: mockSuppressAll, status: mockStatus, manualStatus: mockStatus === 'dnd' ? 'dnd' : null }
  }) }
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
  mockSuppressAll = null
  mockStatus = 'online'
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

  it.each([true, false])('honors Do Not Disturb for live alerts and sounds with focus %s', async (focused) => {
    jest.spyOn(document, 'hasFocus').mockReturnValue(focused)
    const desktop = { showNotification: jest.fn() }
    Object.defineProperty(window, 'electronAPI', { value: desktop, configurable: true })
    mockStatus = 'dnd'
    try {
      showNotification('New DM', 'Hi', '/channels/@me/chat')
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect([mockShowToast, desktop.showNotification, mockPlayNotifSound].map((mock) => mock.mock.calls.length))
        .toEqual([0, 0, 0])
    } finally {
      Reflect.deleteProperty(window, 'electronAPI')
    }
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

  it('stops native notifications when the account is muted and resumes despite a legacy local mute', () => {
    jest.spyOn(document, 'hasFocus').mockReturnValue(false)
    const desktop = { showNotification: jest.fn() }
    Object.defineProperty(window, 'electronAPI', { value: desktop, configurable: true })
    try {
      mockSuppressAll = true
      showNotification('Muted', 'Body')
      expect(desktop.showNotification).not.toHaveBeenCalled()
      expect(mockPlayNotifSound).not.toHaveBeenCalled()
      saveNotifSettings({ enabled: false })
      mockSuppressAll = false
      showNotification('Resumed', 'Body')
      expect(desktop.showNotification).toHaveBeenCalledTimes(1)
    } finally {
      Reflect.deleteProperty(window, 'electronAPI')
    }
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
        body: 'Body', data: expect.objectContaining({ url: '/channels/@me/chat' })
      }))
    } finally {
      Reflect.deleteProperty(navigator, 'serviceWorker')
    }
  })
})

describe('clearNotifications', () => {
  it('closes only the matching browser toast after a cross-device read', async () => {
    jest.spyOn(document, 'hasFocus').mockReturnValue(false)
    const original = Object.getOwnPropertyDescriptor(window, 'Notification')
    const readToast = { close: jest.fn() }
    const unrelatedToast = { close: jest.fn() }
    const browserNotification = jest.fn().mockReturnValueOnce(readToast).mockReturnValueOnce(unrelatedToast)
    Object.defineProperty(browserNotification, 'permission', { value: 'granted' })
    Object.defineProperty(window, 'Notification', { configurable: true, value: browserNotification })
    try {
      showNotification('First DM', 'Hello', '/channels/@me/first?m=m1')
      showNotification('Second DM', 'Hello', '/channels/@me/second?m=m2')
      expect(browserNotification).toHaveBeenCalledTimes(2)

      await clearNotifications(['/channels/@me/first'])

      expect(unrelatedToast.close).not.toHaveBeenCalled()
      expect(readToast.close).toHaveBeenCalledTimes(1)
    } finally {
      if (original) Object.defineProperty(window, 'Notification', original)
      else Reflect.deleteProperty(window, 'Notification')
    }
  })

  it('keeps a newer push visible when a read arrives for an older message in the same DM', async () => {
    const original = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker')
    const newerToast = {
      data: { url: '/channels/@me/chat?m=new' },
      tag: 'jablu-/channels/@me/chat',
      close: jest.fn()
    }
    const getNotifications = jest.fn().mockResolvedValue([newerToast])
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true, value: { ready: Promise.resolve({ getNotifications }) }
    })
    try {
      await clearNotifications(['/channels/@me/chat?m=old'])

      expect(getNotifications).toHaveBeenCalled()
      expect(newerToast.close).not.toHaveBeenCalled()
    } finally {
      if (original) Object.defineProperty(navigator, 'serviceWorker', original)
      else Reflect.deleteProperty(navigator, 'serviceWorker')
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
