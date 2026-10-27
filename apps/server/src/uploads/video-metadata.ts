import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execute = promisify(execFile)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path: string = require('ffprobe-static').path

export async function probeVideo(file: string, signal?: AbortSignal): Promise<{
  streams?: { codec_type?: string; width?: number; height?: number }[]
}> {
  const { stdout } = await execute(path, ['-v', 'error', '-show_streams', '-print_format', 'json', file], {
    timeout: 10_000, maxBuffer: 1024 * 1024, signal
  })
  return JSON.parse(stdout)
}
