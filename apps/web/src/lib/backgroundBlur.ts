import type { ImageSegmenter } from '@mediapipe/tasks-vision'
import { getBlurSegmenter, maskRgba, MEDIAPIPE_BASE } from './backgroundBlurModel'
import type { BlurWorkerReply, createBlurWorker } from './backgroundBlurWorker'

export function supportsBackgroundBlur(): boolean {
  return typeof HTMLCanvasElement.prototype.captureStream === 'function'
}

export interface BlurHandle {
  stream: MediaStream
  stop: () => void
  getStats?: () => {
    mode: 'worker' | 'main'
    frames: number
    masks: number
    maxMaskPixels: number
    segmentMs: number
    compositeMs: number
  }
}

export function blurSize(width: number, height: number, maxSide: number) {
  const scale = Math.min(1, maxSide / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

export async function createBlurredStream(sourceTrack: MediaStreamTrack): Promise<BlurHandle> {
  const sourceAlive = () => sourceTrack.readyState === 'live'
  if (!sourceAlive()) throw Error('Camera track has ended')
  const video = document.createElement('video')
  video.srcObject = new MediaStream([sourceTrack])
  video.muted = true
  video.playsInline = true
  try {
    await video.play()
  } catch (error) {
    video.srcObject = null
    throw error
  }
  const w = video.videoWidth || 640,
    h = video.videoHeight || 480
  const fps = w * h <= 640 * 480 ? 30 : w * h <= 1280 * 720 ? 24 : 20
  const interval = 1000 / fps
  const makeCanvas = (width: number, height: number) => {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    return canvas
  }
  const output = makeCanvas(w, h),
    foreground = makeCanvas(w, h)
  const inputSize = blurSize(w, h, 256),
    blur = blurSize(w, h, 640)
  const input = makeCanvas(inputSize.width, inputSize.height)
  const background = makeCanvas(blur.width, blur.height),
    mask = makeCanvas(1, 1)
  const ctx = output.getContext('2d')!,
    fg = foreground.getContext('2d')!
  const inputCtx = input.getContext('2d')!,
    bg = background.getContext('2d')!,
    maskCtx = mask.getContext('2d')!
  if (!ctx || !fg || !inputCtx || !bg || !maskCtx) {
    video.pause()
    video.srcObject = null
    throw Error('Canvas unavailable')
  }
  let stream = output.captureStream(0)
  let outputTrack = stream.getVideoTracks()[0] as MediaStreamTrack & { requestFrame?: () => void }
  if (typeof outputTrack?.requestFrame !== 'function') {
    stream.getTracks().forEach((track) => track.stop())
    stream = output.captureStream(fps)
    outputTrack = stream.getVideoTracks()[0] as typeof outputTrack
  }
  let running = true,
    busy = false,
    nextAt = 0,
    lastVideoTime = -1,
    maskAt = -Infinity
  let videoRequest: number | undefined, raf: number | undefined, timer: ReturnType<typeof setTimeout> | undefined
  let engine: ReturnType<typeof createBlurWorker> | undefined
  let model: ImageSegmenter | undefined,
    loadingFallback = false
  let workDeadline: ReturnType<typeof setTimeout> | undefined
  let rejectStartup: ((error: Error) => void) | undefined
  const stats = {
    mode: 'main' as 'worker' | 'main',
    frames: 0,
    masks: 0,
    maxMaskPixels: 0,
    segmentMs: 0,
    compositeMs: 0
  }

  function cancelFrame() {
    if (videoRequest !== undefined) video.cancelVideoFrameCallback(videoRequest)
    if (raf !== undefined) cancelAnimationFrame(raf)
    clearTimeout(timer)
    videoRequest = undefined
    raf = undefined
    timer = undefined
  }
  function stop() {
    if (!running) return
    running = false
    cancelFrame()
    clearTimeout(workDeadline)
    rejectStartup?.(Error('Camera stopped'))
    engine?.dispose()
    engine = undefined
    document.removeEventListener('visibilitychange', reschedule)
    sourceTrack.removeEventListener('ended', stop)
    video.pause()
    video.srcObject = null
    stream.getTracks().forEach((track) => track.stop())
  }
  function schedule() {
    if (!running) return
    if (document.hidden) timer = setTimeout(() => render(performance.now()), interval)
    else if (typeof video.requestVideoFrameCallback === 'function')
      videoRequest = video.requestVideoFrameCallback(render)
    else raf = requestAnimationFrame(render)
  }
  function reschedule() {
    cancelFrame()
    schedule()
  }
  function applyMask(
    rgba: Uint8ClampedArray | undefined,
    width: number,
    height: number,
    timestamp: number,
    segmentMs: number
  ) {
    clearTimeout(workDeadline)
    busy = false
    if (!running) return
    stats.segmentMs += segmentMs
    if (!rgba || performance.now() - timestamp > 250) {
      maskAt = -Infinity
      return
    }
    if (width * height > 256 * 256 || rgba.length !== width * height * 4) throw Error('Invalid blur mask')
    if (mask.width !== width || mask.height !== height) {
      mask.width = width
      mask.height = height
    }
    maskCtx.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0)
    maskAt = timestamp
    stats.masks++
    stats.maxMaskPixels = Math.max(stats.maxMaskPixels, width * height)
  }
  function fallback() {
    clearTimeout(workDeadline)
    engine?.dispose()
    engine = undefined
    busy = false
    maskAt = -Infinity
    if (loadingFallback || model || !running) return
    loadingFallback = true
    void getBlurSegmenter()
      .then((segmenter) => {
        if (running) {
          model = segmenter
          stats.mode = 'main'
        }
      })
      .catch(() => {
        /* Keep a fully blurred frame if inference is unavailable. */
      })
      .finally(() => {
        loadingFallback = false
      })
  }
  function render(now: number) {
    if (!running) return
    schedule()
    if (now < nextAt || video.readyState < 2 || video.currentTime === lastVideoTime) return
    nextAt = now + interval - (Math.max(0, now - nextAt) % interval)
    lastVideoTime = video.currentTime
    inputCtx.drawImage(video, 0, 0, input.width, input.height)
    if (engine && !busy) {
      busy = true
      workDeadline = setTimeout(fallback, 1_000)
      const current = engine
      void createImageBitmap(input)
        .then((bitmap) => {
          if (!running || engine !== current) {
            bitmap.close()
            return
          }
          try {
            current.worker.postMessage({ type: 'frame', bitmap, timestamp: now }, [bitmap])
          } catch {
            bitmap.close()
            fallback()
          }
        })
        .catch(fallback)
    } else if (model) {
      const started = performance.now()
      let result: ReturnType<ImageSegmenter['segmentForVideo']> | undefined
      try {
        result = model.segmentForVideo(input, now)
        const confidence = result.confidenceMasks?.[0]
        applyMask(
          confidence ? maskRgba(confidence.getAsFloat32Array(), confidence.width, confidence.height) : undefined,
          confidence?.width ?? 0,
          confidence?.height ?? 0,
          now,
          performance.now() - started
        )
      } catch {
        maskAt = -Infinity
      } finally {
        result?.confidenceMasks?.forEach((item) => item.close())
        result?.categoryMask?.close()
      }
    }
    const composite = performance.now()
    // Blur and composite in Canvas; never read full-frame RGBA back to JavaScript.
    bg.filter = `blur(${(30 * blur.width) / w}px)`
    bg.drawImage(video, 0, 0, blur.width, blur.height)
    bg.filter = 'none'
    ctx.drawImage(background, 0, 0, w, h)
    if (now - maskAt <= 250) {
      try {
        fg.globalCompositeOperation = 'copy'
        fg.drawImage(video, 0, 0, w, h)
        fg.globalCompositeOperation = 'destination-in'
        fg.drawImage(mask, 0, 0, w, h)
        ctx.drawImage(foreground, 0, 0, w, h)
      } finally {
        fg.globalCompositeOperation = 'source-over'
      }
    }
    outputTrack?.requestFrame?.()
    stats.frames++
    stats.compositeMs += performance.now() - composite
  }
  sourceTrack.addEventListener('ended', stop, { once: true })
  document.addEventListener('visibilitychange', reschedule)
  try {
    if (
      typeof Worker === 'function' &&
      typeof OffscreenCanvas === 'function' &&
      typeof createImageBitmap === 'function'
    ) {
      try {
        engine = (await import('./backgroundBlurWorker')).createBlurWorker()
        const current = engine
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(Error('Blur worker startup timed out')), 15_000)
          rejectStartup = (error) => {
            clearTimeout(timeout)
            reject(error)
          }
          current.worker.onerror = () => rejectStartup?.(Error('Blur worker unavailable'))
          current.worker.onmessage = ({ data }: MessageEvent<BlurWorkerReply>) => {
            if (data.type === 'ready') {
              clearTimeout(timeout)
              resolve()
            } else if (data.type === 'error') rejectStartup?.(Error(data.message))
          }
          const base = new URL(MEDIAPIPE_BASE + '/', window.location.href).href
          current.worker.postMessage({
            type: 'init',
            bundle: base + 'vision_bundle.mjs',
            wasm: base + 'wasm',
            model: base + 'selfie_segmenter.tflite'
          })
        })
        rejectStartup = undefined
        current.worker.onerror = fallback
        current.worker.onmessage = ({ data }: MessageEvent<BlurWorkerReply>) => {
          if (data.type === 'error') fallback()
          else if (data.type === 'mask') {
            try {
              applyMask(
                data.rgba ? new Uint8ClampedArray(data.rgba) : undefined,
                data.width,
                data.height,
                data.timestamp,
                data.segmentMs
              )
            } catch {
              fallback()
            }
          }
        }
        stats.mode = 'worker'
      } catch (error) {
        engine?.dispose()
        engine = undefined
        if (!running) throw error
      }
    }
    if (!engine) model = await getBlurSegmenter()
    if (!running || !sourceAlive()) throw Error('Camera stopped')
    schedule()
    return { stream, stop, getStats: () => ({ ...stats }) }
  } catch (error) {
    stop()
    throw error
  }
}
