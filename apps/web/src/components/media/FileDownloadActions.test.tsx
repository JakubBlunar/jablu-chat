import '@testing-library/jest-dom'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { FileDownloadActions } from './FileDownloadActions'
import { prepareMediaDownload, saveMediaFile } from '@/lib/mediaDownload'

jest.mock('@/lib/api', () => ({ resolveMediaUrl: (url: string) => url }))
jest.mock('@/lib/mediaDownload')
jest.mock('@/stores/toast.store', () => ({ showToast: jest.fn() }))
const file = new File(['document'], 'notes.txt', { type: 'text/plain' })

beforeEach(() => {
  jest.resetAllMocks()
  jest.mocked(prepareMediaDownload).mockResolvedValue(file)
  jest.mocked(saveMediaFile).mockResolvedValue(true)
  Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: 0 })
  Object.defineProperty(navigator, 'canShare', { configurable: true, value: undefined })
})

it('keeps Open separate and downloads only after intent, including cross-origin resources', async () => {
  render(<FileDownloadActions url="https://media.test/notes.txt" filename="notes.txt" />)
  expect(prepareMediaDownload).not.toHaveBeenCalled()
  expect(screen.getByRole('link', { name: 'openOriginal' })).toHaveAttribute('href', 'https://media.test/notes.txt')
  fireEvent.click(screen.getByRole('button', { name: 'download: notes.txt' }))
  await waitFor(() => expect(saveMediaFile).toHaveBeenCalledWith(file))
  expect(prepareMediaDownload).toHaveBeenCalledTimes(1)
})

it('offers an explicit retry after preparation fails', async () => {
  jest.mocked(prepareMediaDownload).mockRejectedValueOnce(new Error('offline'))
  render(<FileDownloadActions url="/notes.txt" filename="notes.txt" />)
  fireEvent.click(screen.getByRole('button', { name: 'download: notes.txt' }))
  fireEvent.click(await screen.findByRole('button', { name: 'retryDownload: notes.txt' }))
  await waitFor(() => expect(saveMediaFile).toHaveBeenCalledWith(file))
  expect(prepareMediaDownload).toHaveBeenCalledTimes(2)
})

it('requires a fresh tap to save or share a prepared file on touch browsers', async () => {
  Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: 5 })
  Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true })
  render(<FileDownloadActions url="/notes.txt" filename="notes.txt" />)
  fireEvent.click(screen.getByRole('button', { name: 'download: notes.txt' }))
  await screen.findByRole('button', { name: 'saveFile: notes.txt' })
  expect(screen.getByRole('status')).toHaveTextContent('fileReadyToSave')
  expect(saveMediaFile).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'saveFile: notes.txt' }))
  await waitFor(() => expect(saveMediaFile).toHaveBeenCalledTimes(1))
})
