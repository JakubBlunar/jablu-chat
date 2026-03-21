import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { EventBusService } from '../events/event-bus.service';
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

const AVATAR_MAX_SIZE = 8 * 1024 * 1024; // 8 MB
const AVATAR_MIMETYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly events: EventBusService,
  ) {}

  @Post('register')
  async register(@Body() dto: RegisterDto) {
    return this.auth.register(dto.username, dto.email, dto.password);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: RefreshTokenDto) {
    return this.auth.refreshToken(dto.refreshToken);
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
}
