import { registerAs } from '@nestjs/config';

export const encryptionConfig = registerAs('encryption', () => ({
  secret: process.env.ENCRYPTION_SECRET, // 64-char hex string → 32-byte key
  algorithm: 'aes-256-gcm',
  ivLength: 12, // bytes — NIST recommendation for GCM
  tagLength: 16, // bytes
}));
