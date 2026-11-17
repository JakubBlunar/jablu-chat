import { act, render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ThemeSync } from './ThemeSync'
import { useSettingsStore } from '@/stores/settings.store'

let mockAuthenticated = true
let mockNativeTheme: 'dark' | 'light' = 'dark'
let mockNativeListener: ((event: { payload: 'dark' | 'light' }) => void) | undefined
const mockUnlisten = jest.fn()
const mockReadTheme = jest.fn(async () => mockNativeTheme)
const mockReadSystemTheme = jest.fn(async () => null as 'dark' | 'light' | null)
jest.mock('@tauri-apps/api/core', () => ({ invoke: () => mockReadSystemTheme() }))
jest.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    theme: mockReadTheme,
    onThemeChanged: jest.fn(async (listener: typeof mockNativeListener) => {
      mockNativeListener = listener
      return mockUnlisten
    })
  })
}))
jest.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (s: { isAuthenticated: boolean }) => unknown) =>
    selector({ isAuthenticated: mockAuthenticated })
}))
let light = false
const listeners = new Set<() => void>()
beforeEach(() => {
  mockAuthenticated = true
  mockNativeTheme = 'dark'
  mockNativeListener = undefined
  mockUnlisten.mockClear()
  mockReadTheme.mockClear()
  mockReadSystemTheme.mockReset().mockResolvedValue(null)
  light = false
  listeners.clear()
  window.matchMedia = jest.fn(() => ({
    matches: light,
    addEventListener: (_: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => listeners.delete(listener)
  })) as unknown as typeof window.matchMedia
  useSettingsStore.setState({ theme: 'system', accent: 'amber' })
})
const view = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <ThemeSync />
    </MemoryRouter>
  )

it('follows OS changes live and honors explicit overrides', () => {
  const { unmount } = view('/channels/@me')
  expect(document.documentElement.dataset.theme).toBe('dark')
  act(() => {
    light = true
    listeners.forEach((listener) => listener())
  })
  expect(document.documentElement.dataset.theme).toBe('light')
  expect(document.documentElement.style.getPropertyValue('--color-primary')).toBe('#946000')
  act(() => {
    light = false
    listeners.forEach((listener) => listener())
  })
  expect(document.documentElement.dataset.theme).toBe('dark')
  act(() => useSettingsStore.getState().setTheme('dark'))
  expect(document.documentElement.dataset.theme).toBe('dark')
  act(() => {
    light = false
    listeners.forEach((listener) => listener())
  })
  act(() => {
    light = true
    listeners.forEach((listener) => listener())
  })
  expect(document.documentElement.dataset.theme).toBe('dark')
  unmount()
  expect(listeners.size).toBe(0)
  expect(document.documentElement.dataset.theme).toBeUndefined()
})

it('follows native desktop changes in both directions even with stale WebView media', async () => {
  Object.defineProperty(window, '__TAURI_INTERNALS__', { configurable: true, value: {} })
  try {
    const { unmount } = view('/channels/@me')
    await act(async () => {})
    expect(document.documentElement.dataset.theme).toBe('dark')
    act(() => mockNativeListener?.({ payload: 'light' }))
    expect(document.documentElement.dataset.theme).toBe('light')
    act(() => mockNativeListener?.({ payload: 'dark' }))
    expect(document.documentElement.dataset.theme).toBe('dark')
    // An OS change missed while tray-hidden is recovered on focus.
    mockNativeTheme = 'light'
    await act(async () => { window.dispatchEvent(new Event('focus')) })
    expect(document.documentElement.dataset.theme).toBe('light')
    act(() => useSettingsStore.getState().setTheme('dark'))
    act(() => mockNativeListener?.({ payload: 'light' }))
    expect(document.documentElement.dataset.theme).toBe('dark')
    unmount()
    expect(mockUnlisten).toHaveBeenCalledTimes(1)
    expect(listeners.size).toBe(0)
  } finally {
    Reflect.deleteProperty(window, '__TAURI_INTERNALS__')
  }
})

it('rechecks browser appearance on resume when no media change was delivered', () => {
  view('/channels/@me')
  light = true
  act(() => document.dispatchEvent(new Event('visibilitychange')))
  expect(document.documentElement.dataset.theme).toBe('light')
  light = false
  act(() => window.dispatchEvent(new Event('pageshow')))
  expect(document.documentElement.dataset.theme).toBe('dark')
})

it('recovers a scheduled Windows switch when native events and WebView media stay stale', async () => {
  jest.useFakeTimers()
  Object.defineProperty(window, '__TAURI_INTERNALS__', { configurable: true, value: {} })
  try {
    mockReadSystemTheme.mockResolvedValue('dark')
    const { unmount } = view('/channels/@me')
    await act(async () => {})
    expect(document.documentElement.dataset.theme).toBe('dark')
    mockReadSystemTheme.mockResolvedValue('light')
    await act(async () => { await jest.advanceTimersByTimeAsync(30_000) })
    expect(document.documentElement.dataset.theme).toBe('light')
    // Window theme and media never changed in this reproduction.
    expect(mockNativeTheme).toBe('dark')
    expect(light).toBe(false)
    unmount()
    expect(jest.getTimerCount()).toBe(0)
  } finally {
    Reflect.deleteProperty(window, '__TAURI_INTERNALS__')
    jest.useRealTimers()
  }
})

it.each(['/login', '/register', '/forgot-password', '/reset-password', '/admin'])('keeps %s dark', (path) => {
  useSettingsStore.setState({ theme: 'light' })
  view(path)
  expect(document.documentElement.dataset.theme).toBe('dark')
})

it('keeps unauthenticated loading screens dark', () => {
  useSettingsStore.setState({ theme: 'light' })
  mockAuthenticated = false
  view('/')
  expect(document.documentElement.dataset.theme).toBe('dark')
})
