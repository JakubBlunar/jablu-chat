import type { ImageSegmenter, FilesetResolver as FilesetResolverType } from '@mediapipe/tasks-vision'

export const MEDIAPIPE_BASE = '/mediapipe-0.10.18'
type VisionModule = { FilesetResolver: typeof FilesetResolverType; ImageSegmenter: typeof ImageSegmenter }
let segmenterPromise: Promise<ImageSegmenter> | null = null

export function getBlurSegmenter(): Promise<ImageSegmenter> {
  if (!segmenterPromise) {
    segmenterPromise = (async () => {
      const { FilesetResolver, ImageSegmenter } = (await import(
        /* @vite-ignore */ `${MEDIAPIPE_BASE}/vision_bundle.mjs`
      )) as VisionModule
      const vision = await FilesetResolver.forVisionTasks(`${MEDIAPIPE_BASE}/wasm`)
      return ImageSegmenter.createFromOptions(vision, {
        baseOptions: { modelAssetPath: `${MEDIAPIPE_BASE}/selfie_segmenter.tflite` },
        outputCategoryMask: false,
        outputConfidenceMasks: true,
        runningMode: 'VIDEO'
      })
    })()
    segmenterPromise.catch(() => {
      segmenterPromise = null
    })
  }
  return segmenterPromise
}

/** Convert only the bounded mask; foreground video never leaves the canvas GPU path. */
export function maskRgba(values: Float32Array, width: number, height: number): Uint8ClampedArray {
  const pixels = width * height
  if (!Number.isSafeInteger(pixels) || pixels <= 0 || pixels > 256 * 256 || values.length !== pixels)
    throw Error('Invalid blur mask')
  const rgba = new Uint8ClampedArray(pixels * 4)
  rgba.fill(255)
  for (let i = 0; i < pixels; i++) rgba[i * 4 + 3] = values[i] * 255
  return rgba
}
