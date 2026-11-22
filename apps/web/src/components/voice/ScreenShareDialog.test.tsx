import '@testing-library/jest-dom'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ScreenShareDialog } from './ScreenShareDialog'

jest.mock('@/hooks/useMobile', () => ({ useIsMobile: () => false }))

it.each([
  ['NotAllowedError', 'screenNotSelected'],
  ['NotReadableError', 'screenShareStartFailed']
])('keeps the chosen sharing options after %s and retries them', async (name, message) => {
  const confirm = jest.fn().mockRejectedValueOnce(Object.assign(new Error(), { name })).mockResolvedValueOnce(undefined)
  const close = jest.fn()
  render(<ScreenShareDialog onConfirm={confirm} onClose={close} />)
  fireEvent.click(screen.getByRole('button', { name: '720p' }))
  fireEvent.click(screen.getByRole('button', { name: /^15 / }))
  const share = screen.getByRole('button', { name: 'screenShareSetup.shareScreen' })
  fireEvent.click(share)
  expect(await screen.findByRole('alert')).toHaveTextContent(message)
  expect(close).not.toHaveBeenCalled()
  fireEvent.click(share)
  await waitFor(() => expect(share).toBeEnabled())
  expect(confirm.mock.calls).toEqual(
    Array(2).fill([{ resolution: '720p', fps: 15, audio: false, highQualityAudio: false }])
  )
  expect(screen.queryByRole('alert')).toBeNull()
})
