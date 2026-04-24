import * as bcrypt from 'bcrypt';
import { randomBytes, createHash } from 'crypto';

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
