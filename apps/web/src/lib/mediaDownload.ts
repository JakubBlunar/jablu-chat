import { isDesktop } from '@/lib/desktop'

const DOWNLOAD_EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/avif': '.avif',
  'image/heic': '.heic',
  'image/heif': '.heif',
  'image/svg+xml': '.svg',
  'image/bmp': '.bmp',
  'image/tiff': '.tiff',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
  'audio/mpeg': '.mp3',
  'audio/mp4': '.m4a',
  'audio/ogg': '.ogg',
  'application/pdf': '.pdf',
  'application/zip': '.zip',
  'text/plain': '.txt'
}

export async function prepareMediaDownload(url: string, filename: string, signal?: AbortSignal): Promise<File> {
  const response = await fetch(url, ...(signal ? [{ signal }] : []))
  if (!response.ok) throw new Error(`Download failed (${response.status})`)
  const blob = await response.blob()
  const type = blob.type || 'application/octet-stream'
  const extension = DOWNLOAD_EXTENSIONS[type.split(';')[0].trim().toLowerCase()]
  const name = filename.trim().replace(/\.+$/, '') || 'download'
  const downloadName = /\.[a-z0-9]+$/i.test(name) || !extension ? name : `${name}${extension}`
  return new File([blob], downloadName, { type })
}

export async function saveMediaFile(file: File): Promise<boolean> {
  if (!isDesktop && navigator.maxTouchPoints > 0 && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] })
      return true
    } catch (error) {
      if ((error as { name?: string }).name === 'AbortError') return false
      throw error
    }
  }

  const url = URL.createObjectURL(file)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = file.name
  // WebView2 handles downloads in the current webview. Opening a blob in a
  // new window can discard the download along with the blob's webview context.
  if (!isDesktop) anchor.target = '_blank'
  anchor.rel = 'noopener noreferrer'
  document.body.appendChild(anchor)
  try {
    anchor.click()
  } finally {
    anchor.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }
  return true
}
