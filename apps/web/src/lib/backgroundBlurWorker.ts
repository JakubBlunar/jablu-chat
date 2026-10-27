import type { ImageSegmenter, FilesetResolver } from '@mediapipe/tasks-vision'

export type BlurWorkerReply =
  | { type: 'ready' }
  | { type: 'error'; message: string }
  | {
      type: 'mask'
      rgba?: ArrayBuffer
      width: number
      height: number
      timestamp: number
      segmentMs: number
    }

/** Self-contained classic worker: the pinned WASM loader uses importScripts. */
async function workerMain() {
  const scope = self as unknown as {
    onmessage: ((event: MessageEvent) => void) | null
    postMessage: (data: unknown, transfer?: Transferable[]) => void
  }
  let segmenter: ImageSegmenter | undefined
  scope.onmessage = async ({ data }) => {
    if (data.type === 'init') {
      try {
        const vision = (await import(/* @vite-ignore */ data.bundle)) as {
          FilesetResolver: typeof FilesetResolver
          ImageSegmenter: typeof ImageSegmenter
        }
        segmenter = await vision.ImageSegmenter.createFromOptions(
          await vision.FilesetResolver.forVisionTasks(data.wasm),
          {
            baseOptions: { modelAssetPath: data.model },
            canvas: new OffscreenCanvas(256, 256),
            outputCategoryMask: false,
            outputConfidenceMasks: true,
            runningMode: 'VIDEO'
          }
        )
        scope.postMessage({ type: 'ready' })
      } catch (error) {
        scope.postMessage({ type: 'error', message: String(error) })
      }
      return
    }
    if (data.type !== 'frame') return
    const started = performance.now()
    let result: ReturnType<ImageSegmenter['segmentForVideo']> | undefined
    try {
      if (!segmenter) throw Error('Blur worker is not initialized')
      result = segmenter.segmentForVideo(data.bitmap, data.timestamp)
      const mask = result.confidenceMasks?.[0]
      if (!mask) {
        scope.postMessage({
          type: 'mask',
          width: 0,
          height: 0,
          timestamp: data.timestamp,
          segmentMs: performance.now() - started
        })
        return
      }
      const values = mask.getAsFloat32Array(),
        pixels = mask.width * mask.height
      if (pixels > 256 * 256 || pixels <= 0 || values.length !== pixels) throw Error('Invalid blur mask')
      const rgba = new Uint8ClampedArray(pixels * 4)
      rgba.fill(255)
      for (let i = 0; i < pixels; i++) rgba[i * 4 + 3] = values[i] * 255
      scope.postMessage(
        {
          type: 'mask',
          rgba: rgba.buffer,
          width: mask.width,
          height: mask.height,
          timestamp: data.timestamp,
          segmentMs: performance.now() - started
        },
        [rgba.buffer]
      )
    } catch (error) {
      scope.postMessage({ type: 'error', message: String(error) })
    } finally {
      result?.confidenceMasks?.forEach((mask) => mask.close())
      result?.categoryMask?.close()
      data.bitmap.close()
    }
  }
}

export function createBlurWorker() {
  const url = URL.createObjectURL(new Blob([`(${workerMain.toString()})()`], { type: 'application/javascript' }))
  try {
    const worker = new Worker(url)
    return {
      worker,
      dispose: () => {
        worker.terminate()
        URL.revokeObjectURL(url)
      }
    }
  } catch (error) {
    URL.revokeObjectURL(url)
    throw error
  }
}
