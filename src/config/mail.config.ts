import { registerAs } from '@nestjs/config';

export const mailConfig = registerAs('mail', () => ({
  apiKey: process.env.MAILJET_API_KEY!,
  secretKey: process.env.MAILJET_SECRET_KEY!,
  fromAddress: process.env.MAIL_FROM_ADDRESS || 'noreply@servixos.com',
  fromName: process.env.MAIL_FROM_NAME || 'ServixOS',
}));
