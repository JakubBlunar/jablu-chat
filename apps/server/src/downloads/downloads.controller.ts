import { Controller, Get, Param, Res } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Response } from 'express'
import { existsSync, readdirSync, statSync } from 'fs'
import { resolve, join, extname } from 'path'

interface DownloadEntry {
  filename: string
  platform: string
  version: string | null
  size: number
  updatedAt: string
}

/** Extracts a semver (e.g. `1.0.2`) from an installer filename, if present. */
function parseVersion(filename: string): [number, number, number] | null {
  const m = filename.match(/(\d+)\.(\d+)\.(\d+)/)
  if (!m) return null
  return [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)]
}

/** True when `a` is a newer release than `b` (by version, falling back to mtime). */
function isNewer(a: DownloadEntry, b: DownloadEntry): boolean {
  const va = parseVersion(a.filename)
  const vb = parseVersion(b.filename)
  if (va && vb) {
    for (let i = 0; i < 3; i++) {
      if (va[i] !== vb[i]) return va[i] > vb[i]
    }
  }
  // Same version or unversioned: newer file wins.
  return a.updatedAt > b.updatedAt
}

const PLATFORM_MAP: Record<string, string> = {
  '.exe': 'windows',
  '.msi': 'windows',
  '.dmg': 'macos',
  '.pkg': 'macos',
  '.appimage': 'linux',
  '.deb': 'linux',
  '.rpm': 'linux',
  '.snap': 'linux'
}

const IGNORED_EXTENSIONS = new Set(['.yml', '.yaml', '.blockmap', '.json', '.sig'])

@Controller('downloads')
export class DownloadsController {
  private readonly downloadsDir: string

  constructor(config: ConfigService) {
    this.downloadsDir = resolve(config.get<string>('DOWNLOADS_DIR', './downloads'))
  }

  @Get()
  listDownloads() {
    if (!existsSync(this.downloadsDir)) {
      return []
    }

    // Keep only the newest installer per platform, so shipping additional OS
    // builds later just adds one entry each rather than listing every version.
    const latestByPlatform = new Map<string, DownloadEntry>()

    for (const name of readdirSync(this.downloadsDir)) {
      const ext = extname(name).toLowerCase()
      if (IGNORED_EXTENSIONS.has(ext)) continue

      const platform = PLATFORM_MAP[ext]
      if (!platform) continue

      const fullPath = join(this.downloadsDir, name)
      try {
        const s = statSync(fullPath)
        if (!s.isFile()) continue
        const version = parseVersion(name)
        const entry: DownloadEntry = {
          filename: name,
          platform,
          version: version ? version.join('.') : null,
          size: s.size,
          updatedAt: s.mtime.toISOString()
        }
        const existing = latestByPlatform.get(platform)
        if (!existing || isNewer(entry, existing)) {
          latestByPlatform.set(platform, entry)
        }
      } catch {
        continue
      }
    }

    return [...latestByPlatform.values()]
  }

  @Get(':filename')
  downloadFile(@Param('filename') filename: string, @Res() res: Response) {
    const safe = filename.replace(/[^a-zA-Z0-9._\- ]/g, '')
    const baseDir = resolve(this.downloadsDir)
    const fullPath = resolve(baseDir, safe)

    if (!fullPath.startsWith(baseDir) || !existsSync(fullPath)) {
      return res.status(404).json({ message: 'File not found' })
    }

    res.setHeader('Content-Disposition', `attachment; filename="${safe}"`)
    return res.sendFile(fullPath)
  }
}
