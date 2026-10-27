import { blurSize, createBlurredStream } from './backgroundBlur'
import { getBlurSegmenter, maskRgba } from './backgroundBlurModel'

jest.mock('./backgroundBlurModel', () => ({
  ...jest.requireActual('./backgroundBlurModel'),
  getBlurSegmenter: jest.fn()
}))

it('bounds masks independently of full output resolution and validates mask dimensions', () => {
  expect(blurSize(1920, 1080, 256)).toEqual({ width: 256, height: 144 })
  expect(blurSize(1080, 1920, 256)).toEqual({ width: 144, height: 256 })
  expect([...maskRgba(new Float32Array([0, 0.5, 1]), 3, 1)]).toEqual([
    255, 255, 255, 0, 255, 255, 255, 128, 255, 255, 255, 255
  ])
  expect(() => maskRgba(new Float32Array(1), 1920, 1080)).toThrow('Invalid blur mask')
})

it('composites without full-frame readbacks, closes masks, and stops only owned output tracks', async () => {
  const callbacks = new Map<number, VideoFrameRequestCallback>()
  let callbackId = 0
  const originalCreate = document.createElement.bind(document)
  const canvases: HTMLCanvasElement[] = []
  const contexts: {
    drawImage: jest.Mock
    putImageData: jest.Mock
    getImageData: jest.Mock
    globalCompositeOperation: string
    filter: string
  }[] = []
  let video!: HTMLVideoElement
  const outputStop = jest.fn()
  const requestFrame = jest.fn()
  const source = Object.assign(new EventTarget(), { readyState: 'live', stop: jest.fn() })
  const originalStream = Object.getOwnPropertyDescriptor(globalThis, 'MediaStream')
  const originalImage = Object.getOwnPropertyDescriptor(globalThis, 'ImageData')
  const originalCapture = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'captureStream')
  const originalWorker = Object.getOwnPropertyDescriptor(globalThis, 'Worker')
  Object.defineProperty(globalThis, 'Worker', { configurable: true, value: undefined })
  Object.defineProperty(globalThis, 'MediaStream', { configurable: true, value: class {} })
  Object.defineProperty(globalThis, 'ImageData', {
    configurable: true,
    value: class {
      data: Uint8ClampedArray
      width: number
      height: number
      constructor(data: Uint8ClampedArray, width: number, height: number) {
        this.data = data; this.width = width; this.height = height
      }
    }
  })
  Object.defineProperty(HTMLCanvasElement.prototype, 'captureStream', {
    configurable: true,
    value: () => ({ getTracks: () => [{ stop: outputStop }], getVideoTracks: () => [{ requestFrame }] })
  })
  const getContext = jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
    this: HTMLCanvasElement
  ) {
    const context = {
      drawImage: jest.fn(),
      putImageData: jest.fn(),
      getImageData: jest.fn(() => {
        throw Error('readback forbidden')
      }),
      globalCompositeOperation: 'source-over',
      filter: 'none'
    }
    canvases.push(this)
    contexts.push(context)
    return context as unknown as CanvasRenderingContext2D
  })
  const create = jest.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    const element = originalCreate(tag)
    if (tag === 'video') {
      video = element as HTMLVideoElement
      Object.defineProperties(video, {
        videoWidth: { value: 1920 },
        videoHeight: { value: 1080 },
        readyState: { value: 2 },
        currentTime: { value: 0, writable: true }
      })
      video.play = jest.fn().mockResolvedValue(undefined)
      video.pause = jest.fn()
      video.requestVideoFrameCallback = (cb) => {
        callbacks.set(++callbackId, cb)
        return callbackId
      }
      video.cancelVideoFrameCallback = (id) => {
        callbacks.delete(id)
      }
    }
    return element
  })
  const close = jest.fn()
  const segment = jest.fn(() => ({
    confidenceMasks: [{ width: 256, height: 144, getAsFloat32Array: () => new Float32Array(256 * 144).fill(1), close }]
  }))
  jest.mocked(getBlurSegmenter).mockResolvedValue({ segmentForVideo: segment } as never)
  const clock = jest.spyOn(performance, 'now').mockReturnValue(100)
  let handle: Awaited<ReturnType<typeof createBlurredStream>> | undefined
  try {
    handle = await createBlurredStream(source as unknown as MediaStreamTrack)
    video.currentTime = 1
    const callback = [...callbacks.values()][0]!
    callback(100, {} as VideoFrameCallbackMetadata)
    expect(handle.getStats?.()).toMatchObject({ mode: 'main', frames: 1, masks: 1, maxMaskPixels: 36864 })
    expect(contexts.every((c) => c.getImageData.mock.calls.length === 0)).toBe(true)
    expect(close).toHaveBeenCalledTimes(1)
    expect(requestFrame).toHaveBeenCalledTimes(1)
    expect(contexts[4]!.putImageData).toHaveBeenCalledWith(expect.objectContaining({ width: 256, height: 144 }), 0, 0)
    segment.mockImplementationOnce(() => {
      throw Error('inference failed')
    })
    video.currentTime = 2
    clock.mockReturnValue(200)
    callback(200, {} as VideoFrameCallbackMetadata)
    // Only the fully blurred background is output after inference fails.
    expect(contexts[0]!.drawImage.mock.calls.at(-1)?.[0]).toBe(canvases[3])
    source.dispatchEvent(new Event('ended'))
    handle.stop()
    expect(outputStop).toHaveBeenCalledTimes(1)
    expect(source.stop).not.toHaveBeenCalled()
    const count = handle.getStats?.().frames
    callback(300, {} as VideoFrameCallbackMetadata)
    expect(handle.getStats?.().frames).toBe(count)
  } finally {
    handle?.stop()
    clock.mockRestore()
    create.mockRestore()
    getContext.mockRestore()
    for (const [target, key, descriptor] of [
      [globalThis, 'MediaStream', originalStream],
      [globalThis, 'ImageData', originalImage],
      [globalThis, 'Worker', originalWorker],
      [HTMLCanvasElement.prototype, 'captureStream', originalCapture]
    ] as const) {
      if (descriptor) Object.defineProperty(target, key, descriptor)
      else Reflect.deleteProperty(target, key)
    }
  }
})
