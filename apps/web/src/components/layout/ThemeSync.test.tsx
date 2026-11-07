import { act, render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ThemeSync } from './ThemeSync'
import { useSettingsStore } from '@/stores/settings.store'

let mockAuthenticated = true
jest.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (s: { isAuthenticated: boolean }) => unknown) =>
    selector({ isAuthenticated: mockAuthenticated })
}))
let light = false
const listeners = new Set<() => void>()
beforeEach(() => {
  mockAuthenticated = true
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
