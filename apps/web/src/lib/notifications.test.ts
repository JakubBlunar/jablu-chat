import { getNotifSettings, saveNotifSettings, showNotification, playSound, requestPermission } from './notifications'

jest.mock('@/lib/sounds', () => ({
  playNotifSound: jest.fn(),
}))

jest.mock('@/stores/toast.store', () => ({
  showToast: jest.fn(),
}))

import { playNotifSound } from '@/lib/sounds'
import { showToast } from '@/stores/toast.store'

const mockPlayNotifSound = jest.mocked(playNotifSound)
const mockShowToast = jest.mocked(showToast)

beforeEach(() => {
  jest.clearAllMocks()
  localStorage.clear()
})

describe('getNotifSettings', () => {
  it('returns defaults when nothing stored', () => {
    const settings = getNotifSettings()
    expect(settings).toEqual({ enabled: true, soundEnabled: true })
  })

  it('returns stored settings merged with defaults', () => {
    localStorage.setItem('jablu-notif-settings', JSON.stringify({ soundEnabled: false }))

    const settings = getNotifSettings()
    expect(settings.enabled).toBe(true)
    expect(settings.soundEnabled).toBe(false)
  })

  it('returns defaults on corrupted storage', () => {
    localStorage.setItem('jablu-notif-settings', 'not-json')

    const settings = getNotifSettings()
    expect(settings).toEqual({ enabled: true, soundEnabled: true })
  })
})

describe('saveNotifSettings', () => {
  it('persists partial settings merged with current', () => {
    saveNotifSettings({ soundEnabled: false })

    const stored = JSON.parse(localStorage.getItem('jablu-notif-settings')!)
    expect(stored.enabled).toBe(true)
    expect(stored.soundEnabled).toBe(false)
  })
})

describe('showNotification', () => {
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

    expect(mockElectron.showNotification).toHaveBeenCalledWith('T', 'B', '/url')
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
