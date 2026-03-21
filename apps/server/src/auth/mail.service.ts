import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter;

  constructor(private readonly config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.config.get<string>('SMTP_HOST', 'localhost'),
      port: parseInt(this.config.get<string>('SMTP_PORT', '1025'), 10),
      secure: false,
      auth: this.config.get<string>('SMTP_USER')
        ? {
            user: this.config.get<string>('SMTP_USER'),
            pass: this.config.get<string>('SMTP_PASS'),
          }
        : undefined,
    });
  }

  async sendPasswordReset(
    to: string,
    username: string,
    resetUrl: string,
  ): Promise<void> {
    const from = this.config.get<string>('SMTP_FROM', 'noreply@chat.local');

    try {
      await this.transporter.sendMail({
        from,
        to,
        subject: 'Password Reset Request',
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Password Reset</h2>
            <p>Hi ${username},</p>
            <p>You requested a password reset. Click the link below to set a new password:</p>
            <p>
              <a href="${resetUrl}" 
                 style="display: inline-block; padding: 12px 24px; background-color: #5865F2; color: white; text-decoration: none; border-radius: 6px;">
                Reset Password
              </a>
            </p>
            <p>This link expires in 1 hour.</p>
            <p>If you didn't request this, you can safely ignore this email.</p>
          </div>
        `,
      });
      this.logger.log(`Password reset email sent to ${to}`);
    } catch (error) {
      this.logger.error(`Failed to send password reset email to ${to}`, error);
    }
  }
}
