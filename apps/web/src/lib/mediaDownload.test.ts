import { prepareMediaDownload, saveMediaFile } from './mediaDownload'

jest.mock('./desktop', () => ({ isDesktop: false }))

describe('media downloads', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    jest.useFakeTimers()
    Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: 1 })
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: jest.fn(() => true) })
    Object.defineProperty(navigator, 'share', { configurable: true, value: jest.fn().mockResolvedValue(undefined) })
    URL.createObjectURL = jest.fn(() => 'blob:download')
    URL.revokeObjectURL = jest.fn()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    jest.runOnlyPendingTimers()
    jest.useRealTimers()
    jest.restoreAllMocks()
    Reflect.deleteProperty(navigator, 'maxTouchPoints')
    Reflect.deleteProperty(navigator, 'canShare')
    Reflect.deleteProperty(navigator, 'share')
  })

  it('fetches the actual file with its original name and MIME type', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(['image'], { type: 'image/png' })
    })

    const file = await prepareMediaDownload('/uploads/image.png', 'photo.png')

    expect(fetch).toHaveBeenCalledWith('/uploads/image.png')
    expect(file.name).toBe('photo.png')
    expect(file.type).toBe('image/png')
    expect(file.size).toBe(5)
  })

  it.each([
    ['photo', 'image/png', 'photo.png'],
    ['image', 'image/jpeg', 'image.jpg'],
    ['animation', 'image/gif', 'animation.gif'],
    ['photo', 'image/webp', 'photo.webp'],
    ['photo', 'image/avif', 'photo.avif'],
    ['photo', 'image/heic', 'photo.heic'],
    ['scan', 'image/svg+xml', 'scan.svg'],
    ['clip', 'video/mp4', 'clip.mp4'],
    ['document', 'application/pdf', 'document.pdf'],
    ['photo.jpeg', 'image/jpeg', 'photo.jpeg'],
    ['PHOTO.PNG', 'image/png', 'PHOTO.PNG'],
    ['photo.', 'image/png', 'photo.png'],
    ['', 'image/png', 'download.png'],
    ['photo', 'image/png; charset=utf-8', 'photo.png'],
    ['file', 'application/octet-stream', 'file']
  ])('prepares %s (%s) with download name %s', async (filename, type, expected) => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(['file'], { type })
    })

    const file = await prepareMediaDownload('/uploads/file', filename)

    expect(file.name).toBe(expected)
  })

  it('uses the inferred extension in both native sharing and browser downloads', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(['image'], { type: 'image/png' })
    })
    const file = await prepareMediaDownload('/uploads/photo', 'photo')
    await saveMediaFile(file)
    expect(jest.mocked(navigator.share).mock.calls[0][0]?.files?.[0].name).toBe('photo.png')

    jest.mocked(navigator.canShare).mockReturnValue(false)
    const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe('photo.png')
    })
    await saveMediaFile(file)
    expect(click).toHaveBeenCalledTimes(1)
  })

  it('rejects HTTP failures instead of saving an error page', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404 })
    await expect(prepareMediaDownload('/missing', 'photo.png')).rejects.toThrow('404')
  })

  it('opens the native file sheet synchronously from the save action on touch devices', async () => {
    const file = new File(['image'], 'photo.png', { type: 'image/png' })
    const result = saveMediaFile(file)

    expect(navigator.share).toHaveBeenCalledWith({ files: [file] })
    expect(URL.createObjectURL).not.toHaveBeenCalled()
    await expect(result).resolves.toBe(true)
  })

  it('does not open a link when the native sheet is cancelled', async () => {
    jest.mocked(navigator.share).mockRejectedValue(new DOMException('Cancelled', 'AbortError'))
    await expect(saveMediaFile(new File(['image'], 'photo.png'))).resolves.toBe(false)
    expect(URL.createObjectURL).not.toHaveBeenCalled()
  })

  it('reports native share failures without navigating away', async () => {
    jest.mocked(navigator.share).mockRejectedValue(new DOMException('Not allowed', 'NotAllowedError'))
    await expect(saveMediaFile(new File(['image'], 'photo.png'))).rejects.toThrow('Not allowed')
    expect(URL.createObjectURL).not.toHaveBeenCalled()
  })

  it.each([0, 5])('downloads inside the desktop webview without opening a new window (touch points: %s)', async (touchPoints) => {
    jest.replaceProperty(jest.requireMock('./desktop'), 'isDesktop', true)
    Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: touchPoints })
    const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.href).toBe('blob:download')
      expect(this.download).toBe('photo.png')
      expect(this.target).toBe('')
    })
    await expect(saveMediaFile(new File(['image'], 'photo.png'))).resolves.toBe(true)
    expect(click).toHaveBeenCalledTimes(1)
    expect(navigator.share).not.toHaveBeenCalled()
  })

  it.each([0, 1])('downloads a blob without replacing the app when file sharing is unavailable (touch points: %s)', async (touchPoints) => {
    Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: touchPoints })
    jest.mocked(navigator.canShare).mockReturnValue(false)
    const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.href).toBe('blob:download')
      expect(this.download).toBe('photo.png')
      expect(this.target).toBe('_blank')
      expect(this.rel).toBe('noopener noreferrer')
      expect(this.isConnected).toBe(true)
    })

    await expect(saveMediaFile(new File(['image'], 'photo.png'))).resolves.toBe(true)

    expect(click).toHaveBeenCalledTimes(1)
    expect(navigator.share).not.toHaveBeenCalled()
    expect(document.querySelector('a[download]')).toBeNull()
    expect(URL.revokeObjectURL).not.toHaveBeenCalled()
    jest.runOnlyPendingTimers()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:download')
  })
})
