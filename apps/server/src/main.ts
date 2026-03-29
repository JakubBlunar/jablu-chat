import { ValidationPipe } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'
import cookieParser from 'cookie-parser'
import helmet from 'helmet'
import { AppModule } from './app.module'
import { buildAllowedOrigins, WsAdapter } from './gateway/ws-adapter'

// BigInt cannot be serialized by JSON.stringify by default
;(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function () {
  return this.toString()
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  const configService = app.get(ConfigService)

  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }))
  app.use(cookieParser())

  const allowedOrigins = buildAllowedOrigins(configService)
  app.enableCors({ origin: allowedOrigins, credentials: true })
  app.useWebSocketAdapter(new WsAdapter(app))

  const httpAdapter = app.getHttpAdapter()
  httpAdapter.getInstance().set('trust proxy', 1)

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true
    })
  )
  app.setGlobalPrefix('api')

  const port = parseInt(configService.get<string>('PORT') ?? '3001', 10)
  await app.listen(port)
}

void bootstrap()
