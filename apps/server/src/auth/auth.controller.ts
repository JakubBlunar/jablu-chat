import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { EventBusService } from '../events/event-bus.service';
import { AuthRateLimiter } from './auth-rate-limiter';
import { AuthService } from './auth.service';
import { CurrentUser } from './current-user.decorator';
import {
  ChangeEmailDto,
  ChangePasswordDto,
  ForgotPasswordDto,
  LoginDto,
  RefreshTokenDto,
  RegisterDto,
  ResetPasswordDto,
  UpdateProfileDto,
  UpdateStatusDto,
} from './dto';

function extractIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  return req.ip ?? '';
}

const AVATAR_MAX_SIZE = 8 * 1024 * 1024; // 8 MB
const AVATAR_MIMETYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly events: EventBusService,
    private readonly rateLimiter: AuthRateLimiter,
  ) {}

  private checkRateLimit(req: Request) {
    const ip = extractIp(req);
    const { allowed, retryAfter } = this.rateLimiter.check(ip);
    if (!allowed) {
      throw new BadRequestException(
        `Too many attempts. Try again in ${retryAfter} seconds.`,
      );
    }
    return ip;
  }

  @Post('register')
  async register(@Body() dto: RegisterDto, @Req() req: Request) {
    const ip = this.checkRateLimit(req);
    try {
      const result = await this.auth.register(dto.username, dto.email, dto.password, dto.inviteCode, req.headers['user-agent'], ip);
      this.rateLimiter.resetOnSuccess(ip);
      return result;
    } catch (err) {
      this.rateLimiter.recordFailure(ip);
      throw err;
    }
  }

  @Get('registration-mode')
  getRegistrationMode() {
    return this.auth.getRegistrationMode();
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    const ip = this.checkRateLimit(req);
    try {
      const result = await this.auth.login(dto.email, dto.password, req.headers['user-agent'], ip);
      this.rateLimiter.resetOnSuccess(ip);
      return result;
    } catch (err) {
      if (err instanceof UnauthorizedException) {
        this.rateLimiter.recordFailure(ip);
      }
      throw err;
    }
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: RefreshTokenDto, @Req() req: Request) {
    return this.auth.refreshToken(dto.refreshToken, req.headers['user-agent'], extractIp(req));
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Body() dto: RefreshTokenDto) {
    await this.auth.logout(dto.refreshToken);
    return { message: 'Logged out successfully' };
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.auth.forgotPassword(dto.email);
    return {
      message:
        'If an account with that email exists, a password reset link has been sent.',
    };
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.auth.resetPassword(dto.token, dto.password);
    return { message: 'Password has been reset successfully' };
  }

  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  async getProfile(@CurrentUser() user: { id: string }) {
    return this.auth.getProfile(user.id);
  }

  @Patch('profile')
  @UseGuards(AuthGuard('jwt'))
  async updateProfile(
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateProfileDto,
  ) {
    return this.auth.updateProfile(user.id, dto);
  }

  @Post('avatar')
  @UseGuards(AuthGuard('jwt'))
  @UseInterceptors(
    FileInterceptor('avatar', {
      limits: { fileSize: AVATAR_MAX_SIZE },
      fileFilter: (_req, file, cb) => {
        if (AVATAR_MIMETYPES.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new BadRequestException('Only JPEG, PNG, GIF, and WebP images are allowed'), false);
        }
      },
    }),
  )
  async uploadAvatar(
    @CurrentUser() user: { id: string },
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('No file provided');
    }
    return this.auth.uploadAvatar(user.id, file);
  }

  @Delete('avatar')
  @UseGuards(AuthGuard('jwt'))
  async deleteAvatar(@CurrentUser() user: { id: string }) {
    return this.auth.deleteAvatar(user.id);
  }

  @Patch('password')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @CurrentUser() user: { id: string },
    @Body() dto: ChangePasswordDto,
  ) {
    await this.auth.changePassword(user.id, dto.currentPassword, dto.newPassword);
    return { message: 'Password changed successfully' };
  }

  @Patch('email')
  @UseGuards(AuthGuard('jwt'))
  async changeEmail(
    @CurrentUser() user: { id: string },
    @Body() dto: ChangeEmailDto,
  ) {
    return this.auth.changeEmail(user.id, dto.email, dto.password);
  }

  @Patch('status')
  @UseGuards(AuthGuard('jwt'))
  async updateStatus(
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateStatusDto,
  ) {
    const updated = await this.auth.updateStatus(user.id, dto.status);
    this.events.emit('user:status', {
      userId: user.id,
      status: dto.status,
    });
    return updated;
  }

  @Get('users/search')
  @UseGuards(AuthGuard('jwt'))
  async searchUsers(@Query('q') q: string) {
    return this.auth.searchUsers(q ?? '');
  }

  @Get('sessions')
  @UseGuards(AuthGuard('jwt'))
  async getSessions(@CurrentUser() user: { id: string }) {
    return this.auth.getSessions(user.id);
  }

  @Delete('sessions/:id')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(HttpStatus.OK)
  async revokeSession(
    @CurrentUser() user: { id: string },
    @Param('id') sessionId: string,
  ) {
    await this.auth.revokeSession(user.id, sessionId);
    return { message: 'Session revoked' };
  }

  @Delete('sessions')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(HttpStatus.OK)
  async revokeAllSessions(
    @CurrentUser() user: { id: string },
    @Body() body: { refreshToken?: string },
  ) {
    let exceptId: string | undefined;
    if (body?.refreshToken) {
      const current = await this.auth.findTokenByValue(body.refreshToken, user.id);
      exceptId = current?.id;
    }
    await this.auth.revokeAllSessions(user.id, exceptId);
    return { message: 'All other sessions revoked' };
  }
}
