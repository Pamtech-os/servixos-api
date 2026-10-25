import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALG = 'aes-256-cbc';
const IV_LEN = 16;

export function encrypt(plaintext: string, secretHex: string): string {
  const key = Buffer.from(secretHex, 'hex');
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALG, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  return Buffer.concat([iv, encrypted]).toString('base64');
}

export function decrypt(ciphertext: string, secretHex: string): string {
  const key = Buffer.from(secretHex, 'hex');
  const buf = Buffer.from(ciphertext, 'base64');
  const iv = buf.subarray(0, IV_LEN);
  const encrypted = buf.subarray(IV_LEN);
  const decipher = createDecipheriv(ALG, key, iv);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString(
    'utf8',
  );
}

export interface EncryptedRequest {
  payload: string;
}
