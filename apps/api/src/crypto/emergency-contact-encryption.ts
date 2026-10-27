import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { getSecretValue } from './secrets-provider.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

const ENCODED_SEPARATOR = ':';
const SECRET_NAME = 'emergency-contact-key';

let cachedKey: Buffer | null = null;

function encodeParts(iv: Buffer, ciphertext: Buffer, tag: Buffer): string {
  return [
    iv.toString('base64'),
    ciphertext.toString('base64'),
    tag.toString('base64'),
  ].join(ENCODED_SEPARATOR);
}

function decodeParts(encoded: string): [Buffer, Buffer, Buffer] {
  const parts = encoded.split(ENCODED_SEPARATOR);
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted data format');
  }
  return [
    Buffer.from(parts[0], 'base64'),
    Buffer.from(parts[1], 'base64'),
    Buffer.from(parts[2], 'base64'),
  ];
}

export function encrypt(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return encodeParts(iv, encrypted, tag);
}

export function decrypt(encoded: string, key: Buffer): string {
  const [iv, ciphertext, tag] = decodeParts(encoded);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf-8');
}

export async function getEncryptionKey(): Promise<Buffer> {
  if (cachedKey) return cachedKey;

  const envKey = process.env.EMERGENCY_CONTACT_ENCRYPTION_KEY;
  if (envKey) {
    const key = Buffer.from(envKey, 'base64');
    if (key.length !== 32) {
      throw new Error(
        `EMERGENCY_CONTACT_ENCRYPTION_KEY must be 32 bytes (base64-encoded). Got ${key.length} bytes.`,
      );
    }
    cachedKey = key;
    return key;
  }

  // Provider seam: `OKUVU_SECRETS_PROVIDER` picks GCP Secret Manager (default,
  // unchanged) or AWS Secrets Manager. The secret's *name* and payload format
  // (base64, 32 bytes) are identical in both, so the key value can be copied
  // across without touching this code — and EMERGENCY_CONTACT_ENCRYPTION_KEY
  // above still wins over both, which is the zero-downtime cutover lever.
  const payload = await getSecretValue(SECRET_NAME);
  const key = Buffer.from(payload, 'base64');
  if (key.length !== 32) {
    throw new Error(
      `Secret Manager key must be 32 bytes. Got ${key.length} bytes.`,
    );
  }
  cachedKey = key;
  return key;
}

export function clearCachedKey(): void {
  cachedKey = null;
}
