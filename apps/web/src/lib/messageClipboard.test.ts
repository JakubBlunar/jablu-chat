import { copyMessageContent, shareMessageLink } from './messageClipboard'
import { showToast } from '@/stores/toast.store'

jest.mock('@/stores/toast.store', () => ({ showToast: jest.fn() }))
const writeText = jest.fn()
beforeEach(() => {
  jest.clearAllMocks()
  writeText.mockReset().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
  Object.defineProperty(navigator, 'share', { configurable: true, value: undefined })
  jest.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => jest.restoreAllMocks())

it('waits for successful clipboard completion', async () => {
  expect(await copyMessageContent('hello')).toBe(true)
  expect(writeText).toHaveBeenCalledWith('hello')
  expect(showToast).toHaveBeenCalledTimes(1)
})

it('reports both promise rejection and an unavailable API', async () => {
  writeText.mockRejectedValueOnce(new Error('denied'))
  expect(await copyMessageContent('hello')).toBe(false)
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined })
  expect(await copyMessageContent('hello')).toBe(false)
  expect(showToast).toHaveBeenCalledTimes(2)
})

it('does not copy or claim success when native sharing is cancelled', async () => {
  Object.defineProperty(navigator, 'share', {
    configurable: true,
    value: jest.fn().mockRejectedValue(new DOMException('Cancelled', 'AbortError'))
  })
  expect(await shareMessageLink('https://example.com', 'Message')).toBe(false)
  expect(writeText).not.toHaveBeenCalled()
  expect(showToast).not.toHaveBeenCalled()
})

it('falls back to clipboard when sharing fails', async () => {
  Object.defineProperty(navigator, 'share', {
    configurable: true,
    value: jest.fn().mockRejectedValue(new Error('unavailable'))
  })
  expect(await shareMessageLink('https://example.com', 'Message')).toBe(true)
  expect(writeText).toHaveBeenCalledWith('https://example.com')
})
