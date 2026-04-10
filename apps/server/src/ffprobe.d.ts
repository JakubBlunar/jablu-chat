declare module 'ffprobe' {
  type FfprobeCallback = (err: Error | null, metadata: unknown) => void
  function ffprobe(path: string, opts: unknown, cb: FfprobeCallback): void
  export = ffprobe
}
