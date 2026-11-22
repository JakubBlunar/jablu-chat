import '@testing-library/jest-dom'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { DesktopAppSection } from './DesktopAppSection'
import { electronAPI } from '@/lib/electron'

jest.mock('@/lib/electron', () => ({
  electronAPI: {
    getAutoLaunch: jest.fn(),
    setAutoLaunch: jest.fn(),
    getStartMinimized: jest.fn(),
    setStartMinimized: jest.fn()
  }
}))

it('only enables confirmed values and retries a failing native read and write independently', async () => {
  const native = jest.mocked(electronAPI!)
  let resolve!: (value: boolean) => void
  native.getAutoLaunch.mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r
      })
  )
  native.getStartMinimized.mockRejectedValueOnce(new Error()).mockResolvedValueOnce(false).mockResolvedValueOnce(true)
  native.setStartMinimized.mockRejectedValueOnce(new Error()).mockResolvedValueOnce(undefined)
  render(<DesktopAppSection />)
  const launch = screen.getByRole('switch', { name: 'desktop.startAtLogin' })
  const minimized = screen.getByRole('switch', { name: 'desktop.startMinimized' })
  expect(launch).toBeDisabled()
  await act(async () => resolve(true))
  expect(launch).toHaveAttribute('aria-checked', 'true')
  expect(minimized).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'retry' }))
  await waitFor(() => expect(minimized).toBeEnabled())
  fireEvent.click(minimized)
  await screen.findByRole('alert')
  expect(minimized).toHaveAttribute('aria-checked', 'false')
  fireEvent.click(screen.getByRole('button', { name: 'retry' }))
  await waitFor(() => expect(minimized).toHaveAttribute('aria-checked', 'true'))
  expect(native.setStartMinimized).toHaveBeenCalledTimes(2)
})
