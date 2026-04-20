import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALG = 'aes-256-gcm';
const IV_LEN = 12;

export function encrypt(
  plaintext: string,
  secretHex: string,
): EncryptedEnvelope {
  const key = Buffer.from(secretHex, 'hex');
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALG, key, iv, { authTagLength: 16 });

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);

  return {
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    payload: encrypted.toString('base64'),
  };
}

export function decrypt(
  envelope: EncryptedEnvelope,
  secretHex: string,
): string {
  const key = Buffer.from(secretHex, 'hex');
  const iv = Buffer.from(envelope.iv, 'base64');
  const tag = Buffer.from(envelope.tag, 'base64');
  const encrypted = Buffer.from(envelope.payload, 'base64');

  const decipher = createDecipheriv(ALG, key, iv, { authTagLength: 16 });
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString(
    'utf8',
  );
}

export interface EncryptedEnvelope {
  iv: string;
  tag: string;
  payload: string;
}
