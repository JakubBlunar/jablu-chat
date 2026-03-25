import { Controller, Get, Param, Res } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Response } from 'express'
import { existsSync, readdirSync, statSync } from 'fs'
import { resolve, join, extname } from 'path'

interface DownloadEntry {
  filename: string
  platform: string
  size: number
  updatedAt: string
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

const IGNORED_EXTENSIONS = new Set(['.yml', '.yaml', '.blockmap', '.json'])

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

    const entries: DownloadEntry[] = []

    for (const name of readdirSync(this.downloadsDir)) {
      const ext = extname(name).toLowerCase()
      if (IGNORED_EXTENSIONS.has(ext)) continue

      const platform = PLATFORM_MAP[ext]
      if (!platform) continue

      const fullPath = join(this.downloadsDir, name)
      try {
        const s = statSync(fullPath)
        if (!s.isFile()) continue
        entries.push({
          filename: name,
          platform,
          size: s.size,
          updatedAt: s.mtime.toISOString()
        })
      } catch {
        continue
      }
    }

    return entries
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
