import '@testing-library/jest-dom'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { PwaInstallBanner } from './PwaInstallBanner'

let mockTarget = 'desktop'
let mockShow = true
const mockTrigger = jest.fn()
jest.mock('@/lib/electron', () => ({ isElectron: false }))
jest.mock('@/hooks/usePwaInstall', () => ({
  usePwaInstall: () => ({
    canPrompt: true,
    showInstallUi: mockShow,
    triggerInstall: mockTrigger,
    installTarget: mockTarget
  }),
  isDismissed: () => false,
  dismissBanner: jest.fn()
}))

beforeEach(() => {
  jest.useFakeTimers()
  mockTarget = 'desktop'
  mockShow = true
  mockTrigger.mockReset()
})
afterEach(() => jest.useRealTimers())

it('promotes the Windows app instead of a PWA even when a browser install prompt exists', () => {
  const open = jest.fn()
  window.addEventListener('open-settings', open)
  render(<PwaInstallBanner />)
  act(() => jest.advanceTimersByTime(5000))
  fireEvent.click(screen.getByRole('button', { name: 'install.getWindowsApp' }))
  expect(open.mock.calls[0][0].detail).toBe('downloads')
  expect(mockTrigger).not.toHaveBeenCalled()
  window.removeEventListener('open-settings', open)
})

it('offers the PWA on other platforms and hides promotion after installation', () => {
  mockTarget = 'pwa'
  const { rerender } = render(<PwaInstallBanner />)
  act(() => jest.advanceTimersByTime(5000))
  fireEvent.click(screen.getByRole('button', { name: 'install.install' }))
  expect(mockTrigger).toHaveBeenCalledTimes(1)
  mockShow = false
  rerender(<PwaInstallBanner />)
  expect(screen.queryByRole('button', { name: 'install.install' })).not.toBeInTheDocument()
})
