import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  app.use(cookieParser());

  const serverHost = configService.get<string>('SERVER_HOST', 'localhost');
  const tlsMode = configService.get<string>('TLS_MODE', 'off');
  const proto = tlsMode === 'off' ? 'http' : 'https';
  const allowedOrigins = [
    `${proto}://${serverHost}`,
    'http://localhost:5173',
    'http://localhost:4173',
  ];
  app.enableCors({ origin: allowedOrigins, credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.setGlobalPrefix('api');

  const port = parseInt(configService.get<string>('PORT') ?? '3001', 10);
  await app.listen(port);
}

void bootstrap();
