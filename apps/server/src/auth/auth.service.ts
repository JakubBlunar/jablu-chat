import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../prisma/prisma.service';
import { UploadsService } from '../uploads/uploads.service';
import { MailService } from './mail.service';

const PROFILE_SELECT = {
  id: true,
  username: true,
  email: true,
  avatarUrl: true,
  bio: true,
  status: true,
  lastSeenAt: true,
  createdAt: true,
} as const;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
    private readonly uploads: UploadsService,
  ) {}

  async register(username: string, email: string, password: string) {
    const existingUser = await this.prisma.user.findFirst({
      where: { OR: [{ email }, { username }] },
    });
    if (existingUser) {
      if (existingUser.email === email) {
        throw new ConflictException('Email already in use');
      }
      throw new ConflictException('Username already taken');
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await this.prisma.user.create({
      data: { username, email, passwordHash },
      select: PROFILE_SELECT,
    });

    const tokens = await this.generateTokens(user.id);
    return { ...tokens, user };
  }

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const tokens = await this.generateTokens(user.id);
    const profile = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: PROFILE_SELECT,
    });
    return { ...tokens, user: profile! };
  }

  async refreshToken(refreshToken: string) {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: true },
    });

    if (!stored || stored.expiresAt < new Date()) {
      if (stored) {
        await this.prisma.refreshToken.delete({ where: { id: stored.id } });
      }
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    await this.prisma.refreshToken.delete({ where: { id: stored.id } });

    const tokens = await this.generateTokens(stored.userId);
    const profile = await this.prisma.user.findUnique({
      where: { id: stored.userId },
      select: PROFILE_SELECT,
    });
    return { ...tokens, user: profile! };
  }

  async logout(refreshToken: string) {
    await this.prisma.refreshToken
      .delete({ where: { token: refreshToken } })
      .catch(() => {});
  }

  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      return;
    }

    await this.prisma.passwordReset.updateMany({
      where: { userId: user.id, used: false },
      data: { used: true },
    });

    const token = uuidv4();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await this.prisma.passwordReset.create({
      data: { userId: user.id, token, expiresAt },
    });

    const serverHost = this.config.get<string>('SERVER_HOST', 'localhost');
    const tlsMode = this.config.get<string>('TLS_MODE', 'off');
    const protocol = tlsMode === 'off' ? 'http' : 'https';
    const resetUrl = `${protocol}://${serverHost}/reset-password?token=${token}`;

    await this.mail.sendPasswordReset(user.email, user.username, resetUrl);
  }

  async resetPassword(token: string, newPassword: string) {
    const reset = await this.prisma.passwordReset.findUnique({
      where: { token },
    });

    if (!reset || reset.used || reset.expiresAt < new Date()) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await this.prisma.$transaction([
      this.prisma.passwordReset.update({
        where: { id: reset.id },
        data: { used: true },
      }),
      this.prisma.user.update({
        where: { id: reset.userId },
        data: { passwordHash },
      }),
      this.prisma.refreshToken.deleteMany({
        where: { userId: reset.userId },
      }),
    ]);
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: PROFILE_SELECT,
    });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    return user;
  }

  async updateProfile(
    userId: string,
    data: { username?: string; bio?: string },
  ) {
    if (data.username) {
      const existing = await this.prisma.user.findFirst({
        where: { username: data.username, NOT: { id: userId } },
      });
      if (existing) {
        throw new ConflictException('Username already taken');
      }
    }

    return this.prisma.user.update({
      where: { id: userId },
      data,
      select: PROFILE_SELECT,
    });
  }

  async uploadAvatar(userId: string, file: Express.Multer.File) {
    const current = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { avatarUrl: true },
    });
    if (current?.avatarUrl) {
      this.uploads.deleteFile(current.avatarUrl);
    }

    const avatarUrl = await this.uploads.saveAvatar(file);
    return this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl },
      select: PROFILE_SELECT,
    });
  }

  async deleteAvatar(userId: string) {
    const current = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { avatarUrl: true },
    });
    if (current?.avatarUrl) {
      this.uploads.deleteFile(current.avatarUrl);
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: null },
      select: PROFILE_SELECT,
    });
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('User not found');

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      throw new BadRequestException('Current password is incorrect');
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });
  }

  async changeEmail(userId: string, email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('User not found');

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new BadRequestException('Password is incorrect');
    }

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing && existing.id !== userId) {
      throw new ConflictException('Email already in use');
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: { email },
      select: PROFILE_SELECT,
    });
  }

  async updateStatus(
    userId: string,
    status: 'online' | 'idle' | 'dnd' | 'offline',
  ) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { status: status as any },
      select: PROFILE_SELECT,
    });
  }

  async searchUsers(query: string) {
    const q = query.trim();
    if (!q || q.length < 2) return [];
    return this.prisma.user.findMany({
      where: {
        username: { contains: q, mode: 'insensitive' },
      },
      select: { id: true, username: true, avatarUrl: true },
      take: 20,
    });
  }

  private async generateTokens(userId: string) {
    const accessToken = this.jwt.sign({ sub: userId });

    const refreshTokenValue = uuidv4();
    const refreshExpiresAt = new Date(
      Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
    );

    await this.prisma.refreshToken.create({
      data: {
        token: refreshTokenValue,
        userId,
        expiresAt: refreshExpiresAt,
      },
    });

    return { accessToken, refreshToken: refreshTokenValue };
  }
}
