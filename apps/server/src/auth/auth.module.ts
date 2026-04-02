import { Module, forwardRef } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { JwtModule } from '@nestjs/jwt'
import { PassportModule } from '@nestjs/passport'
import { FriendsModule } from '../friends/friends.module'
import { AuthController } from './auth.controller'
import { AuthRateLimiter } from './auth-rate-limiter'
import { AuthService } from './auth.service'
import { BotTokenStrategy } from './bot-token.strategy'
import { JwtStrategy } from './jwt.strategy'
import { MailService } from './mail.service'
import { UnifiedAuthGuard } from './unified-auth.guard'
import { UsersController } from './users.controller'

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secret = config.get<string>('JWT_SECRET')
        if (!secret) throw new Error('JWT_SECRET environment variable is required')
        return {
          secret,
          signOptions: { expiresIn: '1d' }
        }
      }
    }),
    forwardRef(() => FriendsModule)
  ],
  controllers: [AuthController, UsersController],
  providers: [AuthService, AuthRateLimiter, JwtStrategy, BotTokenStrategy, UnifiedAuthGuard, MailService],
  exports: [AuthService, JwtModule, MailService, UnifiedAuthGuard, BotTokenStrategy]
})
export class AuthModule {}
