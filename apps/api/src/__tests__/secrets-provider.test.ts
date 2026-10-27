import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockAccessSecretVersion = vi.hoisted(() => vi.fn());
const mockSecretsSend = vi.hoisted(() => vi.fn());

vi.mock('@google-cloud/secret-manager', () => ({
  SecretManagerServiceClient: vi.fn(() => ({ accessSecretVersion: mockAccessSecretVersion })),
}));

vi.mock('@aws-sdk/client-secrets-manager', () => ({
  SecretsManagerClient: vi.fn(() => ({ send: mockSecretsSend })),
  GetSecretValueCommand: vi.fn((input: unknown) => ({ __type: 'GetSecretValueCommand', input })),
}));

import { getSecretValue } from '../crypto/secrets-provider.js';
import { clearCachedKey, getEncryptionKey } from '../crypto/emergency-contact-encryption.js';

const ENV_KEYS = [
  'OKUVU_SECRETS_PROVIDER',
  'AWS_REGION',
  'AWS_SECRETS_PREFIX',
  'VERTEX_AI_PROJECT_ID',
  'EMERGENCY_CONTACT_ENCRYPTION_KEY',
] as const;

/** 32 bytes, base64 — the shape both clouds store for this key. */
const KEY_BASE64 = Buffer.alloc(32, 7).toString('base64');

describe('secrets provider', () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    vi.clearAllMocks();
    clearCachedKey();
    for (const key of ENV_KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  describe('GCP (default)', () => {
    it('reads the latest version of projects/<project>/secrets/<name>', async () => {
      process.env.VERTEX_AI_PROJECT_ID = 'evia-500215';
      mockAccessSecretVersion.mockResolvedValue([{ payload: { data: Buffer.from('payload-1') } }]);

      const value = await getSecretValue('emergency-contact-key');

      expect(value).toBe('payload-1');
      expect(mockAccessSecretVersion).toHaveBeenCalledWith({
        name: 'projects/evia-500215/secrets/emergency-contact-key/versions/latest',
      });
      expect(mockSecretsSend).not.toHaveBeenCalled();
    });

    it('throws when Secret Manager returns an empty payload', async () => {
      mockAccessSecretVersion.mockResolvedValue([{ payload: {} }]);

      await expect(getSecretValue('emergency-contact-key')).rejects.toThrow(
        'Secret Manager returned empty payload',
      );
    });
  });

  describe('AWS', () => {
    beforeEach(() => {
      process.env.OKUVU_SECRETS_PROVIDER = 'aws';
    });

    it('reads the secret by name from Secrets Manager', async () => {
      mockSecretsSend.mockResolvedValue({ SecretString: KEY_BASE64 });

      const value = await getSecretValue('emergency-contact-key');

      expect(value).toBe(KEY_BASE64);
      expect(mockSecretsSend).toHaveBeenCalledTimes(1);
      expect(mockSecretsSend.mock.calls[0][0].input).toEqual({ SecretId: 'emergency-contact-key' });
      expect(mockAccessSecretVersion).not.toHaveBeenCalled();
    });

    it('applies AWS_SECRETS_PREFIX', async () => {
      process.env.AWS_SECRETS_PREFIX = 'evia-beta/';
      mockSecretsSend.mockResolvedValue({ SecretString: KEY_BASE64 });

      await getSecretValue('emergency-contact-key');

      expect(mockSecretsSend.mock.calls[0][0].input.SecretId).toBe(
        'evia-beta/emergency-contact-key',
      );
    });

    it('unwraps a JSON-encoded secret under "key"', async () => {
      mockSecretsSend.mockResolvedValue({
        SecretString: JSON.stringify({ key: KEY_BASE64, rotated_at: '2026-01-01' }),
      });

      expect(await getSecretValue('emergency-contact-key')).toBe(KEY_BASE64);
    });

    it('unwraps a JSON-encoded secret under the logical secret name', async () => {
      mockSecretsSend.mockResolvedValue({
        SecretString: JSON.stringify({ 'emergency-contact-key': KEY_BASE64 }),
      });

      expect(await getSecretValue('emergency-contact-key')).toBe(KEY_BASE64);
    });

    it('returns a JSON object with no known key verbatim rather than guessing', async () => {
      const raw = JSON.stringify({ something_else: 'x' });
      mockSecretsSend.mockResolvedValue({ SecretString: raw });

      expect(await getSecretValue('emergency-contact-key')).toBe(raw);
    });

    it('throws on an empty payload', async () => {
      mockSecretsSend.mockResolvedValue({});

      await expect(getSecretValue('emergency-contact-key')).rejects.toThrow(
        'Secrets Manager returned an empty payload for secret "emergency-contact-key"',
      );
    });

    it('propagates SDK errors', async () => {
      mockSecretsSend.mockRejectedValue(new Error('ResourceNotFoundException'));

      await expect(getSecretValue('emergency-contact-key')).rejects.toThrow(
        'ResourceNotFoundException',
      );
    });
  });

  describe('emergency-contact-encryption integration', () => {
    it('keeps env-var-first ordering: EMERGENCY_CONTACT_ENCRYPTION_KEY wins over any provider', async () => {
      process.env.OKUVU_SECRETS_PROVIDER = 'aws';
      process.env.EMERGENCY_CONTACT_ENCRYPTION_KEY = KEY_BASE64;

      const key = await getEncryptionKey();

      expect(key).toHaveLength(32);
      expect(mockSecretsSend).not.toHaveBeenCalled();
      expect(mockAccessSecretVersion).not.toHaveBeenCalled();
    });

    it('loads the same 32-byte key from AWS Secrets Manager when no env key is set', async () => {
      process.env.OKUVU_SECRETS_PROVIDER = 'aws';
      mockSecretsSend.mockResolvedValue({ SecretString: KEY_BASE64 });

      const key = await getEncryptionKey();

      expect(key).toHaveLength(32);
      expect(key.equals(Buffer.alloc(32, 7))).toBe(true);
    });

    it('rejects an AWS key that is not 32 bytes', async () => {
      process.env.OKUVU_SECRETS_PROVIDER = 'aws';
      mockSecretsSend.mockResolvedValue({ SecretString: Buffer.alloc(16, 1).toString('base64') });

      await expect(getEncryptionKey()).rejects.toThrow(/must be 32 bytes/);
    });
  });
});
