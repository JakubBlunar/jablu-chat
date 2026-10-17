import { act, renderHook } from '@testing-library/react'
import { checkRelatedInstalledApp, getIsStandalone, usePwaInstall } from './usePwaInstall'
import { showToast } from '@/stores/toast.store'

let mockNative = false
jest.mock('@/lib/electron', () => ({
  get isElectron() {
    return mockNative
  }
}))
jest.mock('@/stores/toast.store', () => ({ showToast: jest.fn() }))
jest.mock('i18next', () => ({ __esModule: true, default: { t: (key: string) => key } }))

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: () => ({
      matches: false,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn()
    })
  })
})

afterEach(() => {
  mockNative = false
  Reflect.deleteProperty(navigator, 'getInstalledRelatedApps')
})

it('only treats a matching related web app as evidence of installation', async () => {
  const query = jest.fn().mockResolvedValue([{ platform: 'windows', url: '/manifest.webmanifest' }])
  Object.defineProperty(navigator, 'getInstalledRelatedApps', { configurable: true, value: query })
  expect(await checkRelatedInstalledApp()).toBe(false)
  query.mockResolvedValue([{ platform: 'webapp', url: 'https://unrelated.example/manifest.webmanifest' }])
  expect(await checkRelatedInstalledApp()).toBe(false)
  query.mockResolvedValue([{ platform: 'webapp', url: '/manifest.webmanifest' }])
  expect(await checkRelatedInstalledApp()).toBe(true)
})

it('consumes each browser prompt once, reports errors and reacts to installation', async () => {
  const { result } = renderHook(usePwaInstall)
  const prompt = jest.fn().mockResolvedValue({ outcome: 'dismissed' })
  act(() => window.dispatchEvent(Object.assign(new Event('beforeinstallprompt', { cancelable: true }), { prompt })))
  expect(result.current.canPrompt).toBe(true)
  await act(async () => {
    expect(await result.current.triggerInstall()).toBe(false)
  })
  await act(async () => {
    expect(await result.current.triggerInstall()).toBe(false)
  })
  expect(prompt).toHaveBeenCalledTimes(1)
  act(() =>
    window.dispatchEvent(
      Object.assign(new Event('beforeinstallprompt'), {
        prompt: jest.fn().mockRejectedValue(new Error('Install unavailable'))
      })
    )
  )
  await act(async () => {
    await result.current.triggerInstall()
  })
  expect(showToast).toHaveBeenCalledWith('common:error', 'settings:install.failed')
  act(() =>
    window.dispatchEvent(
      Object.assign(new Event('beforeinstallprompt'), {
        prompt: jest.fn().mockResolvedValue({ outcome: 'accepted' })
      })
    )
  )
  await act(async () => {
    expect(await result.current.triggerInstall()).toBe(true)
  })
  expect(result.current.isInstalled).toBe(false)
  act(() => window.dispatchEvent(new Event('appinstalled')))
  expect(result.current.isInstalled).toBe(true)
  expect(result.current.showInstallUi).toBe(false)
})

it('never promotes installation inside the native desktop shell', () => {
  window.dispatchEvent(Object.assign(new Event('beforeinstallprompt'), { prompt: jest.fn() }))
  mockNative = true
  const { result } = renderHook(usePwaInstall)
  expect(result.current.isInstalled).toBe(false)
  expect(result.current.showInstallUi).toBe(false)
})

it('recognizes iOS standalone mode and reacts to installed display-mode changes', () => {
  Object.defineProperty(navigator, 'standalone', { configurable: true, value: true })
  expect(getIsStandalone()).toBe(true)
  Reflect.deleteProperty(navigator, 'standalone')
  const original = Object.getOwnPropertyDescriptor(window, 'matchMedia')!
  const mode = Object.assign(new EventTarget(), { matches: false })
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => mode })
  const { result, unmount } = renderHook(usePwaInstall)
  expect(result.current.isInstalled).toBe(false)
  act(() => {
    mode.matches = true
    mode.dispatchEvent(new Event('change'))
  })
  expect(result.current.isInstalled).toBe(true)
  expect(result.current.showInstallUi).toBe(false)
  unmount()
  Object.defineProperty(window, 'matchMedia', original)
})
