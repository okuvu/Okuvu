import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockSecretsSend = vi.hoisted(() => vi.fn());
const mockSecretsManagerClient = vi.hoisted(() => vi.fn(() => ({ send: mockSecretsSend })));

vi.mock('@aws-sdk/client-secrets-manager', () => ({
  SecretsManagerClient: mockSecretsManagerClient,
  GetSecretValueCommand: vi.fn((input: unknown) => ({ __type: 'GetSecretValueCommand', input })),
}));

import { getSecretValue } from '../crypto/secrets-provider.js';
import { clearCachedKey, getEncryptionKey } from '../crypto/emergency-contact-encryption.js';

/**
 * Secrets Manager only. The Google Secret Manager branch is gone
 * (docs/AWS-CUTOVER-SPEC.md), so every assertion that used to sit under
 * `the legacy cloud` has an AWS counterpart here: the read itself (by name, via
 * the resolved region), the empty-payload failure, and the prefixed id.
 *
 * `getSecretValue` is the seam every encrypted emergency-contact row depends on
 * — a wrong value here is unrecoverable data, so value extraction is pinned
 * case by case (raw, JSON `key`, JSON `value`, JSON under the secret name,
 * unknown JSON shape verbatim).
 */
const ENV_KEYS = [
  'OKUVU_SECRETS_PROVIDER',
  'AWS_REGION',
  'AWS_DEFAULT_REGION',
  'AWS_SECRETS_PREFIX',
  'VERTEX_AI_PROJECT_ID',
  'EMERGENCY_CONTACT_ENCRYPTION_KEY',
] as const;

/** 32 bytes, base64 — what an operator pastes into the secret. */
const KEY_BASE64 = Buffer.alloc(32, 7).toString('base64');

describe('secrets provider (AWS Secrets Manager)', () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    vi.clearAllMocks();
    clearCachedKey();
    for (const key of ENV_KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
    mockSecretsSend.mockResolvedValue({ SecretString: KEY_BASE64 });
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  describe('secret read', () => {
    it('reads the secret by name from Secrets Manager', async () => {
      const value = await getSecretValue('emergency-contact-key');

      expect(value).toBe(KEY_BASE64);
      expect(mockSecretsSend).toHaveBeenCalledTimes(1);
      expect(mockSecretsSend.mock.calls[0][0].input).toEqual({ SecretId: 'emergency-contact-key' });
    });

    it('builds the client in the resolved region (ap-south-1 by default)', async () => {
      await getSecretValue('emergency-contact-key');

      expect(mockSecretsManagerClient).toHaveBeenCalledWith({ region: 'ap-south-1' });
    });

    it('builds the client in an overridden AWS_REGION', async () => {
      process.env.AWS_REGION = 'ap-southeast-1';

      await getSecretValue('emergency-contact-key');

      expect(mockSecretsManagerClient).toHaveBeenCalledWith({ region: 'ap-southeast-1' });
    });

    it('applies AWS_SECRETS_PREFIX to the requested id', async () => {
      process.env.AWS_SECRETS_PREFIX = 'evia-beta/';

      await getSecretValue('emergency-contact-key');

      expect(mockSecretsSend.mock.calls[0][0].input.SecretId).toBe(
        'evia-beta/emergency-contact-key',
      );
    });

    it('has no provider switch: a leftover the legacy cloud env var cannot select Secret Manager', async () => {
      process.env.OKUVU_SECRETS_PROVIDER = 'gcp';
      process.env.VERTEX_AI_PROJECT_ID = 'evia-500215';

      const value = await getSecretValue('emergency-contact-key');

      expect(value).toBe(KEY_BASE64);
      expect(mockSecretsSend).toHaveBeenCalledTimes(1);
    });
  });

  describe('payload extraction', () => {
    it('returns a raw (non-JSON) secret string verbatim', async () => {
      mockSecretsSend.mockResolvedValue({ SecretString: 'plain-text-secret' });

      expect(await getSecretValue('emergency-contact-key')).toBe('plain-text-secret');
    });

    it('unwraps a JSON-encoded secret under "key"', async () => {
      mockSecretsSend.mockResolvedValue({
        SecretString: JSON.stringify({ key: KEY_BASE64, rotated_at: '2026-01-01' }),
      });

      expect(await getSecretValue('emergency-contact-key')).toBe(KEY_BASE64);
    });

    it('unwraps a JSON-encoded secret under "value"', async () => {
      mockSecretsSend.mockResolvedValue({
        SecretString: JSON.stringify({ value: KEY_BASE64 }),
      });

      expect(await getSecretValue('emergency-contact-key')).toBe(KEY_BASE64);
    });

    it('unwraps a JSON-encoded secret under the logical secret name', async () => {
      mockSecretsSend.mockResolvedValue({
        SecretString: JSON.stringify({ 'emergency-contact-key': KEY_BASE64 }),
      });

      expect(await getSecretValue('emergency-contact-key')).toBe(KEY_BASE64);
    });

    it('prefers "key" over the other accepted wrappers', async () => {
      mockSecretsSend.mockResolvedValue({
        SecretString: JSON.stringify({
          key: 'from-key',
          value: 'from-value',
          'emergency-contact-key': 'from-name',
        }),
      });

      expect(await getSecretValue('emergency-contact-key')).toBe('from-key');
    });

    it('returns a JSON object with no known key verbatim rather than guessing', async () => {
      const raw = JSON.stringify({ something_else: 'x' });
      mockSecretsSend.mockResolvedValue({ SecretString: raw });

      expect(await getSecretValue('emergency-contact-key')).toBe(raw);
    });

    it('returns a JSON array verbatim (not treated as a wrapper)', async () => {
      const raw = JSON.stringify([KEY_BASE64]);
      mockSecretsSend.mockResolvedValue({ SecretString: raw });

      expect(await getSecretValue('emergency-contact-key')).toBe(raw);
    });
  });

  describe('failures', () => {
    it('throws on a missing SecretString, naming the secret id', async () => {
      mockSecretsSend.mockResolvedValue({});

      await expect(getSecretValue('emergency-contact-key')).rejects.toThrow(
        'Secrets Manager returned an empty payload for secret "emergency-contact-key"',
      );
    });

    it('throws on an empty SecretString', async () => {
      mockSecretsSend.mockResolvedValue({ SecretString: '' });

      await expect(getSecretValue('emergency-contact-key')).rejects.toThrow(
        /empty payload/,
      );
    });

    it('names the prefixed id in the empty-payload error', async () => {
      process.env.AWS_SECRETS_PREFIX = 'evia-beta/';
      mockSecretsSend.mockResolvedValue({});

      await expect(getSecretValue('emergency-contact-key')).rejects.toThrow(
        /evia-beta\/emergency-contact-key/,
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
    it('keeps env-var-first ordering: EMERGENCY_CONTACT_ENCRYPTION_KEY wins over Secrets Manager', async () => {
      process.env.EMERGENCY_CONTACT_ENCRYPTION_KEY = KEY_BASE64;

      const key = await getEncryptionKey();

      expect(key).toHaveLength(32);
      expect(mockSecretsSend).not.toHaveBeenCalled();
      expect(mockSecretsManagerClient).not.toHaveBeenCalled();
    });

    it('loads the same 32-byte key from Secrets Manager when no env key is set', async () => {
      const key = await getEncryptionKey();

      expect(key).toHaveLength(32);
      expect(key.equals(Buffer.alloc(32, 7))).toBe(true);
      expect(mockSecretsSend).toHaveBeenCalledTimes(1);
    });

    it('reads the JSON-wrapped key through the same extraction path', async () => {
      mockSecretsSend.mockResolvedValue({
        SecretString: JSON.stringify({ key: KEY_BASE64 }),
      });

      const key = await getEncryptionKey();

      expect(key).toHaveLength(32);
      expect(key.equals(Buffer.alloc(32, 7))).toBe(true);
    });

    it('rejects a key that is not 32 bytes', async () => {
      mockSecretsSend.mockResolvedValue({ SecretString: Buffer.alloc(16, 1).toString('base64') });

      await expect(getEncryptionKey()).rejects.toThrow(/must be 32 bytes/);
    });
  });
});
