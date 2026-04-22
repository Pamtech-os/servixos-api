import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { Transporter } from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly transporter: Transporter;
  private readonly from: string;
  private readonly appUrl: string;

  constructor(private readonly config: ConfigService) {
    this.from = config.get<string>('SMTP_FROM') || 'noreply@servixos.com';
    this.appUrl = config.get<string>('APP_URL') || 'http://localhost:3000';

    this.transporter = nodemailer.createTransport({
      host: config.get<string>('SMTP_HOST') || 'localhost',
      port: config.get<number>('SMTP_PORT') || 587,
      secure: config.get<boolean>('SMTP_SECURE') || false,
      auth: {
        user: config.get<string>('SMTP_USER'),
        pass: config.get<string>('SMTP_PASS'),
      },
    });
  }

  async sendPasswordResetEmail(
    to: string,
    firstName: string,
    token: string,
  ): Promise<void> {
    const resetUrl = `${this.appUrl}/auth/reset-password?token=${token}`;

    try {
      await this.transporter.sendMail({
        from: this.from,
        to,
        subject: 'Reset your ServixOS password',
        html: `
          <p>Hi ${firstName},</p>
          <p>You requested a password reset. Click the link below to set a new password:</p>
          <p><a href="${resetUrl}">${resetUrl}</a></p>
          <p>This link expires in 15 minutes. If you didn't request this, ignore this email.</p>
          <p>— The ServixOS team</p>
        `,
      });
    } catch (err) {
      this.logger.error(
        `Failed to send password reset email to ${to}: ${(err as Error).message}`,
      );
    }
  }
}
