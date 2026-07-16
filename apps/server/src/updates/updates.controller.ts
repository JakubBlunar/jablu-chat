import { Controller, Get, Param, Query, Res } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Response } from 'express'
import { existsSync } from 'fs'
import { resolve, join } from 'path'

function parseVersion(v: string): [number, number, number] | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(v.trim())
  if (!match) return null
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

function compareVersions(a: [number, number, number], b: [number, number, number]): number {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] - b[i]
  }
  return 0
}

@Controller('updates')
export class UpdatesController {
  private readonly updatesDir: string
  private readonly minClientVersion: string
  private readonly maxClientVersion: string | null

  constructor(config: ConfigService) {
    this.updatesDir = resolve(config.get<string>('UPDATES_DIR', './updates'))
    this.minClientVersion = config.get<string>('MIN_CLIENT_VERSION', '0.0.0')
    this.maxClientVersion = config.get<string>('MAX_CLIENT_VERSION', '') || null
  }

  @Get('compat')
  checkCompat(@Query('client') client?: string) {
    const minClient = this.minClientVersion
    const maxClient = this.maxClientVersion
    const minParsed = parseVersion(minClient)
    const maxParsed = maxClient ? parseVersion(maxClient) : null
    const clientParsed = client ? parseVersion(client) : null

    if (!clientParsed || !minParsed) {
      return { supported: true, minClient, maxClient, clientVersion: client ?? null, reason: null as string | null }
    }

    if (compareVersions(clientParsed, minParsed) < 0) {
      return {
        supported: false,
        minClient,
        maxClient,
        clientVersion: client,
        reason: 'client-too-old' as const
      }
    }

    if (maxParsed && compareVersions(clientParsed, maxParsed) > 0) {
      return {
        supported: false,
        minClient,
        maxClient,
        clientVersion: client,
        reason: 'client-too-new' as const
      }
    }

    return { supported: true, minClient, maxClient, clientVersion: client, reason: null as string | null }
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
    } else if (safe.endsWith('.json')) {
      // Tauri updater manifest (latest.json)
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
    } else if (safe.endsWith('.sig')) {
      res.setHeader('Content-Type', 'application/octet-stream')
    }

    return res.sendFile(fullPath)
  }
}
