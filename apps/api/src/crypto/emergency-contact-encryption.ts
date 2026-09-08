import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

const ENCODED_SEPARATOR = ':';
const SECRET_NAME = 'emergency-contact-key';
const SECRET_PROJECT_ID = process.env.VERTEX_AI_PROJECT_ID ?? 'okuvu-dev';

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

  const { SecretManagerServiceClient } = await import(
    '@google-cloud/secret-manager'
  );
  const client = new SecretManagerServiceClient();
  const name = `projects/${SECRET_PROJECT_ID}/secrets/${SECRET_NAME}/versions/latest`;
  const [version] = await client.accessSecretVersion({ name });
  const payload = version.payload?.data?.toString();
  if (!payload) {
    throw new Error('Secret Manager returned empty payload');
  }
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
