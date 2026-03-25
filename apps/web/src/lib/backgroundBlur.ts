import type { ImageSegmenter, FilesetResolver as FilesetResolverType } from '@mediapipe/tasks-vision'

const MEDIAPIPE_BASE = '/mediapipe-0.10.18'
const WASM_PATH = `${MEDIAPIPE_BASE}/wasm`
const MODEL_PATH = `${MEDIAPIPE_BASE}/selfie_segmenter.tflite`

type VisionModule = {
  FilesetResolver: typeof FilesetResolverType
  ImageSegmenter: typeof ImageSegmenter
}

let visionModulePromise: Promise<VisionModule> | null = null

async function loadVisionModule(): Promise<VisionModule> {
  if (!visionModulePromise) {
    visionModulePromise = import(/* @vite-ignore */ `${MEDIAPIPE_BASE}/vision_bundle.mjs`) as Promise<VisionModule>
  }
  return visionModulePromise
}

let segmenterPromise: Promise<ImageSegmenter> | null = null

async function getSegmenter(): Promise<ImageSegmenter> {
  if (!segmenterPromise) {
    segmenterPromise = (async () => {
      const { FilesetResolver, ImageSegmenter } = await loadVisionModule()
      const vision = await FilesetResolver.forVisionTasks(WASM_PATH)
      return ImageSegmenter.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL_PATH },
        outputCategoryMask: false,
        outputConfidenceMasks: true,
        runningMode: 'VIDEO'
      })
    })()

    segmenterPromise.catch(() => {
      segmenterPromise = null
      visionModulePromise = null
    })
  }
  return segmenterPromise
}

export interface BlurHandle {
  stream: MediaStream
  stop: () => void
}

const TARGET_FPS_BY_PIXELS = [
  { maxPixels: 640 * 480, fps: 30 },
  { maxPixels: 1280 * 720, fps: 24 },
  { maxPixels: Infinity, fps: 20 }
]

function targetFps(w: number, h: number): number {
  const px = w * h
  for (const tier of TARGET_FPS_BY_PIXELS) {
    if (px <= tier.maxPixels) return tier.fps
  }
  return 15
}

export async function createBlurredStream(sourceTrack: MediaStreamTrack): Promise<BlurHandle> {
  const segmenter = await getSegmenter()

  const video = document.createElement('video')
  video.srcObject = new MediaStream([sourceTrack])
  video.muted = true
  video.playsInline = true
  await video.play()

  const w = video.videoWidth || 640
  const h = video.videoHeight || 480

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!

  const blurCanvas = document.createElement('canvas')
  blurCanvas.width = w
  blurCanvas.height = h
  const blurCtx = blurCanvas.getContext('2d')!

  // Separate foreground canvas for alpha-masked compositing
  const fgCanvas = document.createElement('canvas')
  fgCanvas.width = w
  fgCanvas.height = h
  const fgCtx = fgCanvas.getContext('2d')!

  let running = true
  let lastRenderTime = 0
  const fps = targetFps(w, h)
  const frameInterval = 1000 / fps

  // Pre-allocate reusable buffer for alpha manipulation
  const pixelCount = w * h
  const alphaBuffer = new Uint8Array(pixelCount)

  function render() {
    if (!running) return

    const now = performance.now()
    if (now - lastRenderTime < frameInterval) {
      requestAnimationFrame(render)
      return
    }
    lastRenderTime = now

    if (video.readyState < 2) {
      requestAnimationFrame(render)
      return
    }

    const result = segmenter.segmentForVideo(video, now)
    const masks = result.confidenceMasks

    blurCtx.filter = 'blur(30px)'
    blurCtx.drawImage(video, 0, 0, w, h)
    blurCtx.filter = 'none'

    ctx.drawImage(blurCanvas, 0, 0)

    if (masks && masks.length > 0) {
      const mask = masks[0]
      const maskData = mask.getAsFloat32Array()

      // Pre-convert mask to uint8 in a tight loop (faster than per-pixel float math in imageData loop)
      for (let i = 0; i < pixelCount; i++) {
        alphaBuffer[i] = (maskData[i] * 255) | 0
      }

      fgCtx.drawImage(video, 0, 0, w, h)

      const imageData = fgCtx.getImageData(0, 0, w, h)
      const pixels = imageData.data

      for (let i = 0; i < pixelCount; i++) {
        pixels[i * 4 + 3] = alphaBuffer[i]
      }

      fgCtx.putImageData(imageData, 0, 0)

      ctx.drawImage(fgCanvas, 0, 0)

      mask.close()
    }

    requestAnimationFrame(render)
  }

  requestAnimationFrame(render)

  const stream = canvas.captureStream(fps)

  return {
    stream,
    stop() {
      running = false
      video.pause()
      video.srcObject = null
      stream.getTracks().forEach((t) => t.stop())
    }
  }
}
