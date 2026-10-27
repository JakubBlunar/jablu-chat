import { lstat, opendir, realpath, unlink } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'

export type PlannedFile = {
  root: string
  path: string
  url: string | null
  size: number
  mtime: number
  inode: number
  device: number
}
export const missing = (error: unknown) => (error as NodeJS.ErrnoException)?.code === 'ENOENT'
export function localUploadPath(url: string | null | undefined): string | null {
  if (!url) return null
  const match = /\/api\/uploads\/([^?#\s"<>]+)/.exec(url)
  if (!match) return null
  let path: string
  try {
    path = decodeURIComponent(match[1])
  } catch {
    throw new Error('Invalid upload URL')
  }
  if (path.includes('\\') || path.split('/').some((part) => part === '..' || part === '.') || isAbsolute(path))
    throw new Error('Unsafe upload URL')
  return path
}
async function checkedPath(root: string, path: string) {
  const base = await realpath(root)
  const full = resolve(base, path)
  if (!full.startsWith(base + sep)) throw new Error('Cleanup path escapes its storage root')
  if ((await realpath(full)) !== full) throw new Error('Cleanup does not follow symbolic links')
  return full
}
export async function snapshotFile(root: string, path: string, url: string | null): Promise<PlannedFile | null> {
  try {
    const info = await lstat(await checkedPath(root, path))
    if (!info.isFile()) throw new Error('Cleanup candidate is not a regular file')
    return {
      root: await realpath(root),
      path,
      url,
      size: info.size,
      mtime: info.mtimeMs,
      inode: info.ino,
      device: info.dev
    }
  } catch (error) {
    if (missing(error)) return null
    throw error
  }
}
export async function deletePlannedFile(file: PlannedFile): Promise<number> {
  const current = await snapshotFile(file.root, file.path, file.url)
  if (!current) return 0
  if (
    current.size !== file.size ||
    current.mtime !== file.mtime ||
    current.inode !== file.inode ||
    current.device !== file.device
  )
    throw new Error(`File changed since review: ${file.path}; create a new audit`)
  try {
    await unlink(await checkedPath(file.root, file.path))
    return current.size
  } catch (error) {
    if (missing(error)) return 0
    throw error
  }
}
export async function* walkFiles(root: string, dir = root): AsyncGenerator<PlannedFile> {
  for await (const entry of await opendir(dir)) {
    const full = resolve(dir, entry.name)
    if (entry.isSymbolicLink()) throw new Error(`Symbolic link in measured storage: ${full}`)
    if (entry.isDirectory()) yield* walkFiles(root, full)
    else if (entry.isFile()) {
      const file = await snapshotFile(root, relative(root, full).split(sep).join('/'), null)
      if (file) yield file
    }
  }
}
