import { Controller, Get, Param, Res } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Response } from 'express'
import { existsSync } from 'fs'
import { resolve, join } from 'path'

@Controller('updates')
export class UpdatesController {
  private readonly updatesDir: string

  constructor(config: ConfigService) {
    this.updatesDir = resolve(config.get<string>('UPDATES_DIR', './updates'))
  }

  @Get(':filename')
  serveUpdate(@Param('filename') filename: string, @Res() res: Response) {
    const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '')
    const fullPath = resolve(join(this.updatesDir, safe))

    if (!fullPath.startsWith(this.updatesDir)) {
      return res.status(400).json({ message: 'Invalid filename' })
    }

    if (!existsSync(fullPath)) {
      return res.status(404).json({ message: 'File not found' })
    }

    if (safe.endsWith('.yml') || safe.endsWith('.yaml')) {
      res.setHeader('Content-Type', 'text/yaml; charset=utf-8')
    }

    return res.sendFile(fullPath)
  }
}
