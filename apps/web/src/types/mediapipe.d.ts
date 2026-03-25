declare module '@mediapipe/tasks-vision' {
  export interface FilesetResolver {
    forVisionTasks(wasmPath: string): Promise<WasmFileset>
  }

  export type WasmFileset = unknown

  export const FilesetResolver: {
    forVisionTasks(wasmPath: string): Promise<WasmFileset>
  }

  export interface ImageSegmenterOptions {
    baseOptions: { modelAssetPath: string }
    outputCategoryMask?: boolean
    outputConfidenceMasks?: boolean
    runningMode?: 'IMAGE' | 'VIDEO' | 'LIVE_STREAM'
  }

  export interface MPMask {
    getAsFloat32Array(): Float32Array
    close(): void
  }

  export interface ImageSegmenterResult {
    confidenceMasks?: MPMask[]
    categoryMask?: MPMask
  }

  export interface ImageSegmenter {
    segmentForVideo(video: HTMLVideoElement, timestampMs: number): ImageSegmenterResult
    segment(image: HTMLImageElement | HTMLVideoElement): ImageSegmenterResult
    close(): void
  }

  export const ImageSegmenter: {
    createFromOptions(fileset: WasmFileset, options: ImageSegmenterOptions): Promise<ImageSegmenter>
  }
}
