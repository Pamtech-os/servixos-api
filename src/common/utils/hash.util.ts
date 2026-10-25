import * as bcrypt from 'bcrypt';
import { randomBytes, createHash, randomInt } from 'crypto';

const SALT_ROUNDS = 12;

export async function hashValue(value: string): Promise<string> {
  return bcrypt.hash(value, SALT_ROUNDS);
}

export async function compareValue(
  value: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(value, hash);
}

export function generateSecureToken(bytes = 32): string {
  return randomBytes(bytes).toString('hex');
}

export function generateOtp(digits = 6): string {
  const max = Math.pow(10, digits);
  const num = randomBytes(4).readUInt32BE(0) % max;
  return num.toString().padStart(digits, '0');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function generateStrongPassword(length = 16): string {
  const safeLength = Math.max(length, 12);
  const uppercase = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lowercase = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#$%^&*()_+-=';
  const all = `${uppercase}${lowercase}${digits}${symbols}`;

  const chars = [
    uppercase[randomInt(0, uppercase.length)],
    lowercase[randomInt(0, lowercase.length)],
    digits[randomInt(0, digits.length)],
    symbols[randomInt(0, symbols.length)],
  ];

  while (chars.length < safeLength) {
    chars.push(all[randomInt(0, all.length)]);
  }

  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join('');
}
