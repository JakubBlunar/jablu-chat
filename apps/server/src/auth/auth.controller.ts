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
  UseInterceptors
} from '@nestjs/common'
import { UnifiedAuthGuard } from './unified-auth.guard'
import { FileInterceptor } from '@nestjs/platform-express'
import type { Request } from 'express'
import { EventBusService } from '../events/event-bus.service'
import { AuthRateLimiter } from './auth-rate-limiter'
import { AuthService } from './auth.service'
import { CurrentUser } from './current-user.decorator'
import {
  ChangeEmailDto,
  ChangePasswordDto,
  ForgotPasswordDto,
  LoginDto,
  RefreshTokenDto,
  RegisterDto,
  ResetPasswordDto,
  UpdateCustomStatusDto,
  UpdateDmPrivacyDto,
  UpdateProfileDto,
  UpdateStatusDto
} from './dto'

function extractIp(req: Request): string {
  return req.ip ?? ''
}

const AVATAR_MAX_SIZE = 8 * 1024 * 1024 // 8 MB
const AVATAR_MIMETYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif'])
const IMG_EXT_MAP: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.gif': 'image/gif', '.webp': 'image/webp', '.heic': 'image/heic', '.heif': 'image/heif',
}
function resolveImageMime(file: { mimetype: string; originalname: string }): string {
  const mime = file.mimetype?.toLowerCase()
  if (mime && mime !== 'application/octet-stream' && AVATAR_MIMETYPES.has(mime)) return mime
  const ext = file.originalname.slice(file.originalname.lastIndexOf('.')).toLowerCase()
  return IMG_EXT_MAP[ext] ?? mime
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly events: EventBusService,
    private readonly rateLimiter: AuthRateLimiter
  ) {}

  private async checkRateLimit(req: Request) {
    const ip = extractIp(req)
    const { allowed, retryAfter } = await this.rateLimiter.check(ip)
    if (!allowed) {
      throw new BadRequestException(`Too many attempts. Try again in ${retryAfter} seconds.`)
    }
    return ip
  }

  @Post('register')
  async register(@Body() dto: RegisterDto, @Req() req: Request) {
    const ip = await this.checkRateLimit(req)
    try {
      const result = await this.auth.register(
        dto.username,
        dto.email,
        dto.password,
        dto.inviteCode,
        req.headers['user-agent'],
        ip
      )
      await this.rateLimiter.resetOnSuccess(ip)
      return result
    } catch (err) {
      await this.rateLimiter.recordFailure(ip)
      throw err
    }
  }

  @Get('registration-mode')
  getRegistrationMode() {
    return this.auth.getRegistrationMode()
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    const ip = await this.checkRateLimit(req)
    try {
      const result = await this.auth.login(dto.email, dto.password, req.headers['user-agent'], ip)
      await this.rateLimiter.resetOnSuccess(ip)
      return result
    } catch (err) {
      if (err instanceof UnauthorizedException) {
        await this.rateLimiter.recordFailure(ip)
      }
      throw err
    }
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: RefreshTokenDto, @Req() req: Request) {
    await this.checkRateLimit(req)
    return this.auth.refreshToken(dto.refreshToken, req.headers['user-agent'], extractIp(req))
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Body() dto: RefreshTokenDto) {
    await this.auth.logout(dto.refreshToken)
    return { message: 'Logged out successfully' }
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() dto: ForgotPasswordDto, @Req() req: Request) {
    await this.checkRateLimit(req)
    await this.auth.forgotPassword(dto.email)
    return {
      message: 'If an account with that email exists, a password reset link has been sent.'
    }
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() dto: ResetPasswordDto, @Req() req: Request) {
    await this.checkRateLimit(req)
    await this.auth.resetPassword(dto.token, dto.password)
    return { message: 'Password has been reset successfully' }
  }

  @Get('me')
  @UseGuards(UnifiedAuthGuard)
  async getProfile(@CurrentUser() user: { id: string }) {
    return this.auth.getProfile(user.id)
  }

  @Patch('profile')
  @UseGuards(UnifiedAuthGuard)
  async updateProfile(@CurrentUser() user: { id: string }, @Body() dto: UpdateProfileDto) {
    return this.auth.updateProfile(user.id, dto)
  }

  @Post('avatar')
  @UseGuards(UnifiedAuthGuard)
  @UseInterceptors(
    FileInterceptor('avatar', {
      limits: { fileSize: AVATAR_MAX_SIZE },
      fileFilter: (_req, file, cb) => {
        const resolved = resolveImageMime(file)
        if (AVATAR_MIMETYPES.has(resolved)) {
          file.mimetype = resolved
          cb(null, true)
        } else {
          cb(new BadRequestException('Only JPEG, PNG, GIF, and WebP images are allowed'), false)
        }
      }
    })
  )
  async uploadAvatar(@CurrentUser() user: { id: string }, @UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file provided')
    }
    return this.auth.uploadAvatar(user.id, file)
  }

  @Delete('avatar')
  @UseGuards(UnifiedAuthGuard)
  async deleteAvatar(@CurrentUser() user: { id: string }) {
    return this.auth.deleteAvatar(user.id)
  }

  @Patch('password')
  @UseGuards(UnifiedAuthGuard)
  @HttpCode(HttpStatus.OK)
  async changePassword(@CurrentUser() user: { id: string }, @Body() dto: ChangePasswordDto) {
    await this.auth.changePassword(user.id, dto.currentPassword, dto.newPassword)
    return { message: 'Password changed successfully' }
  }

  @Patch('email')
  @UseGuards(UnifiedAuthGuard)
  async changeEmail(@CurrentUser() user: { id: string }, @Body() dto: ChangeEmailDto) {
    return this.auth.changeEmail(user.id, dto.email, dto.password)
  }

  @Patch('status')
  @UseGuards(UnifiedAuthGuard)
  async updateStatus(@CurrentUser() user: { id: string }, @Body() dto: UpdateStatusDto) {
    const updated = await this.auth.updateStatus(user.id, dto.status, dto.duration)
    const manualUntil =
      updated.manualStatus == null
        ? undefined
        : updated.manualStatusExpiresAt == null
          ? null
          : updated.manualStatusExpiresAt.toISOString()
    this.events.emit('user:status', {
      userId: user.id,
      status: updated.status,
      manualUntil
    })
    return updated
  }

  @Patch('custom-status')
  @UseGuards(UnifiedAuthGuard)
  async updateCustomStatus(@CurrentUser() user: { id: string }, @Body() dto: UpdateCustomStatusDto) {
    const updated = await this.auth.updateCustomStatus(user.id, dto.customStatus || null)
    this.events.emit('user:custom-status', {
      userId: user.id,
      customStatus: dto.customStatus || null
    })
    return updated
  }

  @Patch('privacy')
  @UseGuards(UnifiedAuthGuard)
  async updateDmPrivacy(@CurrentUser() user: { id: string }, @Body() dto: UpdateDmPrivacyDto) {
    return this.auth.updateDmPrivacy(user.id, dto.dmPrivacy)
  }

  @Get('users/search')
  @UseGuards(UnifiedAuthGuard)
  async searchUsers(@Query('q') q: string, @CurrentUser() user: { id: string }, @Req() req: Request) {
    await this.checkRateLimit(req)
    return this.auth.searchUsers(q ?? '', user.id)
  }

  @Get('sessions')
  @UseGuards(UnifiedAuthGuard)
  async getSessions(@CurrentUser() user: { id: string }) {
    return this.auth.getSessions(user.id)
  }

  @Delete('sessions/:id')
  @UseGuards(UnifiedAuthGuard)
  @HttpCode(HttpStatus.OK)
  async revokeSession(@CurrentUser() user: { id: string }, @Param('id') sessionId: string) {
    await this.auth.revokeSession(user.id, sessionId)
    return { message: 'Session revoked' }
  }

  @Delete('sessions')
  @UseGuards(UnifiedAuthGuard)
  @HttpCode(HttpStatus.OK)
  async revokeAllSessions(@CurrentUser() user: { id: string }, @Body() body: { refreshToken?: string }) {
    let exceptId: string | undefined
    if (body?.refreshToken) {
      const current = await this.auth.findTokenByValue(body.refreshToken, user.id)
      exceptId = current?.id
    }
    await this.auth.revokeAllSessions(user.id, exceptId)
    return { message: 'All other sessions revoked' }
  }
}
