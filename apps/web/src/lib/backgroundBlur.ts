import type {
  ImageSegmenter,
  FilesetResolver as FilesetResolverType,
} from "@mediapipe/tasks-vision";

const CDN_BASE =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18";
const WASM_CDN = `${CDN_BASE}/wasm`;
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite";

type VisionModule = {
  FilesetResolver: typeof FilesetResolverType;
  ImageSegmenter: typeof ImageSegmenter;
};

let visionModulePromise: Promise<VisionModule> | null = null;

async function loadVisionModule(): Promise<VisionModule> {
  if (!visionModulePromise) {
    visionModulePromise = import(
      /* @vite-ignore */ `${CDN_BASE}/vision_bundle.mjs`
    ) as Promise<VisionModule>;
  }
  return visionModulePromise;
}

let segmenterPromise: Promise<ImageSegmenter> | null = null;

async function getSegmenter(): Promise<ImageSegmenter> {
  if (!segmenterPromise) {
    segmenterPromise = (async () => {
      const { FilesetResolver, ImageSegmenter } = await loadVisionModule();
      const vision = await FilesetResolver.forVisionTasks(WASM_CDN);
      return ImageSegmenter.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL_URL },
        outputCategoryMask: false,
        outputConfidenceMasks: true,
        runningMode: "VIDEO",
      });
    })();

    segmenterPromise.catch(() => {
      segmenterPromise = null;
      visionModulePromise = null;
    });
  }
  return segmenterPromise;
}

export interface BlurHandle {
  stream: MediaStream;
  stop: () => void;
}

export async function createBlurredStream(
  sourceTrack: MediaStreamTrack,
): Promise<BlurHandle> {
  const segmenter = await getSegmenter();

  const video = document.createElement("video");
  video.srcObject = new MediaStream([sourceTrack]);
  video.muted = true;
  video.playsInline = true;
  await video.play();

  const w = video.videoWidth || 640;
  const h = video.videoHeight || 480;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  const blurCanvas = document.createElement("canvas");
  blurCanvas.width = w;
  blurCanvas.height = h;
  const blurCtx = blurCanvas.getContext("2d")!;

  let running = true;
  let lastTimestamp = -1;

  function render() {
    if (!running) return;

    const now = performance.now();
    if (now === lastTimestamp) {
      requestAnimationFrame(render);
      return;
    }
    lastTimestamp = now;

    if (video.readyState < 2) {
      requestAnimationFrame(render);
      return;
    }

    const result = segmenter.segmentForVideo(video, now);
    const masks = result.confidenceMasks;

    blurCtx.filter = "blur(14px)";
    blurCtx.drawImage(video, 0, 0, w, h);
    blurCtx.filter = "none";

    ctx.drawImage(blurCanvas, 0, 0);

    if (masks && masks.length > 0) {
      const mask = masks[0];
      const maskData = mask.getAsFloat32Array();

      const imageData = ctx.getImageData(0, 0, w, h);
      const pixels = imageData.data;

      ctx.drawImage(video, 0, 0, w, h);
      const fgData = ctx.getImageData(0, 0, w, h);
      const fgPixels = fgData.data;

      for (let i = 0; i < maskData.length; i++) {
        const confidence = maskData[i];
        const idx = i * 4;
        const alpha = confidence;
        pixels[idx] = Math.round(
          fgPixels[idx] * alpha + pixels[idx] * (1 - alpha),
        );
        pixels[idx + 1] = Math.round(
          fgPixels[idx + 1] * alpha + pixels[idx + 1] * (1 - alpha),
        );
        pixels[idx + 2] = Math.round(
          fgPixels[idx + 2] * alpha + pixels[idx + 2] * (1 - alpha),
        );
        pixels[idx + 3] = 255;
      }

      ctx.putImageData(imageData, 0, 0);
      mask.close();
    }

    requestAnimationFrame(render);
  }

  requestAnimationFrame(render);

  const stream = canvas.captureStream(30);

  return {
    stream,
    stop() {
      running = false;
      video.pause();
      video.srcObject = null;
      stream.getTracks().forEach((t) => t.stop());
    },
  };
}
