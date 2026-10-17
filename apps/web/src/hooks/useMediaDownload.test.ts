import { act, renderHook, waitFor } from '@testing-library/react'
import { prepareMediaDownload, saveMediaFile } from '@/lib/mediaDownload'
import { showToast } from '@/stores/toast.store'
import { useMediaDownload } from './useMediaDownload'

jest.mock('@/lib/api', () => ({ resolveMediaUrl: (url: string) => `https://chat.test${url}` }))
jest.mock('@/lib/mediaDownload')
jest.mock('@/stores/toast.store', () => ({ showToast: jest.fn() }))

describe('useMediaDownload', () => {
  const file = new File(['photo'], 'photo.png', { type: 'image/png' })

  beforeEach(() => {
    jest.resetAllMocks()
    jest.mocked(prepareMediaDownload).mockResolvedValue(file)
    jest.mocked(saveMediaFile).mockResolvedValue(true)
  })

  it('prepares a resolved media URL before saving directly from the tap', async () => {
    const { result } = renderHook(() => useMediaDownload('/uploads/photo.png', 'photo.png'))
    expect(result.current.preparing).toBe(true)
    expect(saveMediaFile).not.toHaveBeenCalled()
    await waitFor(() => expect(result.current.preparing).toBe(false))
    expect(prepareMediaDownload).toHaveBeenCalledWith(
      'https://chat.test/uploads/photo.png',
      'photo.png',
      expect.any(AbortSignal)
    )

    await act(async () => {
      const saving = result.current.download()
      expect(saveMediaFile).toHaveBeenCalledWith(file)
      expect(await saving).toBe(true)
    })
    expect(prepareMediaDownload).toHaveBeenCalledTimes(1)
  })

  it('does not save a previous slide while the next slide loads', async () => {
    const { result, rerender } = renderHook(({ url }) => useMediaDownload(url, 'photo.png'), {
      initialProps: { url: '/first.png' }
    })
    await waitFor(() => expect(result.current.preparing).toBe(false))
    jest.mocked(prepareMediaDownload).mockImplementation(() => new Promise(() => {}))
    rerender({ url: '/next.png' })

    expect(result.current.preparing).toBe(true)
    await act(async () => {
      expect(await result.current.download()).toBe(false)
    })
    expect(saveMediaFile).not.toHaveBeenCalled()
  })

  it('allows retrying preparation failures without navigating', async () => {
    jest.mocked(prepareMediaDownload).mockRejectedValueOnce(new Error('Offline'))
    const { result } = renderHook(() => useMediaDownload('/photo.png', 'photo.png'))
    await waitFor(() => expect(result.current.failed).toBe(true))
    expect(showToast).toHaveBeenCalled()

    await act(async () => {
      expect(await result.current.download()).toBe(false)
    })
    await waitFor(() => expect(result.current.preparing).toBe(false))
    expect(result.current.failed).toBe(false)
    expect(saveMediaFile).not.toHaveBeenCalled()
    await act(async () => {
      expect(await result.current.download()).toBe(true)
    })
  })

  it('keeps cancellation quiet and reports save failures', async () => {
    const { result } = renderHook(() => useMediaDownload('/photo.png', 'photo.png'))
    await waitFor(() => expect(result.current.preparing).toBe(false))
    jest.mocked(saveMediaFile).mockResolvedValueOnce(false)
    await act(async () => {
      expect(await result.current.download()).toBe(false)
    })
    expect(showToast).not.toHaveBeenCalled()

    jest.mocked(saveMediaFile).mockRejectedValueOnce(new Error('Not allowed'))
    await act(async () => {
      expect(await result.current.download()).toBe(false)
    })
    expect(showToast).toHaveBeenCalledWith('downloadFailed', 'downloadSaveFailed')
    expect(result.current.saving).toBe(false)
  })

  it('aborts preparation when the control closes', () => {
    const { unmount } = renderHook(() => useMediaDownload('/photo.png', 'photo.png'))
    const signal = jest.mocked(prepareMediaDownload).mock.calls[0][2]
    unmount()
    expect(signal?.aborted).toBe(true)
  })
})
