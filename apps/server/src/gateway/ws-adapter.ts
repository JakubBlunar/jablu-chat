import { INestApplication } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { IoAdapter } from '@nestjs/platform-socket.io'
import { ServerOptions } from 'socket.io'

export function buildAllowedOrigins(config: ConfigService): string[] {
  const serverHost = config.get<string>('SERVER_HOST', 'localhost')
  const tlsMode = config.get<string>('TLS_MODE', 'off')
  const proto = tlsMode === 'off' ? 'http' : 'https'
  return [`${proto}://${serverHost}`, 'http://localhost:5173', 'http://localhost:4173']
}

export class WsAdapter extends IoAdapter {
  private readonly origins: string[]

  constructor(app: INestApplication) {
    super(app)
    const config = app.get(ConfigService)
    this.origins = buildAllowedOrigins(config)
  }

  createIOServer(port: number, options?: Partial<ServerOptions>) {
    return super.createIOServer(port, {
      ...options,
      cors: { origin: this.origins, credentials: true }
    })
  }
}
