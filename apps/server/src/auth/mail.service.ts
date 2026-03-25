import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as nodemailer from 'nodemailer'

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name)
  private transporter: nodemailer.Transporter

  constructor(private readonly config: ConfigService) {
    const port = parseInt(this.config.get<string>('SMTP_PORT', '1025'), 10)
    this.transporter = nodemailer.createTransport({
      host: this.config.get<string>('SMTP_HOST', 'localhost'),
      port,
      secure: port === 465,
      auth: this.config.get<string>('SMTP_USER')
        ? {
            user: this.config.get<string>('SMTP_USER'),
            pass: this.config.get<string>('SMTP_PASS')
          }
        : undefined
    })
  }

  private get appName(): string {
    return this.config.get<string>('APP_NAME', 'Jablu')
  }

  private get from(): string {
    return this.config.get<string>('SMTP_FROM', 'noreply@chat.local')
  }

  private wrap(body: string): string {
    const name = this.appName
    return `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#1a1a2e;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#1a1a2e;padding:40px 20px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background-color:#25253e;border-radius:12px;overflow:hidden">
        <!-- Header -->
        <tr><td style="background-color:#2a2a4a;padding:28px 32px;text-align:center">
          <span style="font-size:24px;font-weight:700;color:#F59E0B;letter-spacing:0.5px">${name}</span>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:32px">
          ${body}
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:20px 32px;border-top:1px solid #3a3a5c;text-align:center">
          <p style="margin:0;font-size:12px;color:#6b7280">
            &copy; ${new Date().getFullYear()} ${name} &middot; This is an automated message
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
  }

  async sendPasswordReset(to: string, username: string, resetUrl: string): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: this.from,
        to,
        subject: 'Password Reset Request',
        html: this.wrap(`
          <h2 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#ffffff">Password Reset</h2>
          <p style="margin:0 0 16px;font-size:15px;color:#d1d5db">Hi <strong style="color:#ffffff">${username}</strong>,</p>
          <p style="margin:0 0 24px;font-size:15px;color:#d1d5db;line-height:1.6">
            We received a request to reset your password. Click the button below to choose a new one.
          </p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 24px">
            <tr><td align="center" style="background-color:#F59E0B;border-radius:8px">
              <a href="${resetUrl}" style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:600;color:#1a1a2e;text-decoration:none">
                Reset Password
              </a>
            </td></tr>
          </table>
          <p style="margin:0 0 8px;font-size:13px;color:#9ca3af;line-height:1.5">
            This link expires in <strong style="color:#d1d5db">1 hour</strong>.
            If you didn&rsquo;t request this, you can safely ignore this email.
          </p>
          <p style="margin:16px 0 0;font-size:12px;color:#6b7280;word-break:break-all">
            <a href="${resetUrl}" style="color:#F59E0B">${resetUrl}</a>
          </p>
        `)
      })
      this.logger.log(`Password reset email sent to ${to}`)
    } catch (error) {
      this.logger.error(`Failed to send password reset email to ${to}`, error)
    }
  }

  async sendInvite(to: string, code: string, registerUrl: string): Promise<void> {
    const name = this.appName
    try {
      await this.transporter.sendMail({
        from: this.from,
        to,
        subject: `You've been invited to ${name}!`,
        html: this.wrap(`
          <h2 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#ffffff">You&rsquo;re Invited!</h2>
          <p style="margin:0 0 24px;font-size:15px;color:#d1d5db;line-height:1.6">
            An administrator has invited you to join <strong style="color:#ffffff">${name}</strong>.
            Click the button below to create your account.
          </p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 24px">
            <tr><td align="center" style="background-color:#F59E0B;border-radius:8px">
              <a href="${registerUrl}" style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:600;color:#1a1a2e;text-decoration:none">
                Create Account
              </a>
            </td></tr>
          </table>
          <p style="margin:0 0 16px;font-size:13px;color:#9ca3af;line-height:1.5">
            Your invite code is:
          </p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 24px">
            <tr><td style="background-color:#1a1a2e;border-radius:8px;padding:12px 24px;text-align:center">
              <span style="font-size:22px;font-weight:700;color:#F59E0B;letter-spacing:4px;font-family:monospace">${code}</span>
            </td></tr>
          </table>
          <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.5">
            You can also enter this code manually on the registration page.
          </p>
          <p style="margin:16px 0 0;font-size:12px;color:#6b7280;word-break:break-all">
            <a href="${registerUrl}" style="color:#F59E0B">${registerUrl}</a>
          </p>
        `)
      })
      this.logger.log(`Invite email sent to ${to}`)
    } catch (error) {
      this.logger.error(`Failed to send invite email to ${to}`, error)
    }
  }
}
