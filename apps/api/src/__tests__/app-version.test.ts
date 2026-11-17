import { describe, it, expect, afterEach } from 'vitest';
import { buildApp } from '../app.js';

const ENV_KEYS = [
  'OKUVU_MIN_VERSION_CODE',
  'OKUVU_LATEST_VERSION_CODE',
  'OKUVU_LATEST_VERSION_NAME',
  'OKUVU_STORE_URL',
] as const;

const ORIGINAL: Record<string, string | undefined> = {};
for (const key of ENV_KEYS) ORIGINAL[key] = process.env[key];

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (ORIGINAL[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = ORIGINAL[key];
    }
  }
});

function clearOverrides() {
  for (const key of ENV_KEYS) delete process.env[key];
}

describe('GET /app/version', () => {
  it('answers without a session — a first launch has no token yet', async () => {
    clearOverrides();
    const app = buildApp();

    const response = await app.inject({ method: 'GET', url: '/app/version' });

    expect(response.statusCode).toBe(200);
    await app.close();
  });

  it('returns the shipped defaults in the shape the app parses', async () => {
    clearOverrides();
    const app = buildApp();

    const response = await app.inject({ method: 'GET', url: '/app/version' });
    const body = response.json();

    expect(body).toEqual({
      minimumSupportedVersionCode: 14,
      latestVersionCode: 22,
      latestVersionName: '1.0.21',
      storeUrl: 'https://play.google.com/store/apps/details?id=ai.okuvu.app',
    });
    await app.close();
  });

  it('reads the floor and the latest build from the environment per request', async () => {
    clearOverrides();
    process.env.OKUVU_MIN_VERSION_CODE = '22';
    process.env.OKUVU_LATEST_VERSION_CODE = '24';
    process.env.OKUVU_LATEST_VERSION_NAME = '1.0.23';
    process.env.OKUVU_STORE_URL = 'https://example.test/store';
    const app = buildApp();

    const body = (
      await app.inject({ method: 'GET', url: '/app/version' })
    ).json();

    expect(body.minimumSupportedVersionCode).toBe(22);
    expect(body.latestVersionCode).toBe(24);
    expect(body.latestVersionName).toBe('1.0.23');
    expect(body.storeUrl).toBe('https://example.test/store');
    await app.close();
  });

  it('never sets the floor above the newest build, which would block it', async () => {
    clearOverrides();
    process.env.OKUVU_MIN_VERSION_CODE = '99';
    process.env.OKUVU_LATEST_VERSION_CODE = '22';
    const app = buildApp();

    const body = (
      await app.inject({ method: 'GET', url: '/app/version' })
    ).json();

    expect(body.minimumSupportedVersionCode).toBe(22);
    expect(body.latestVersionCode).toBe(22);
    await app.close();
  });

  it('falls back to the shipped defaults on a malformed floor rather than locking the fleet out', async () => {
    clearOverrides();
    process.env.OKUVU_MIN_VERSION_CODE = 'not-a-number';
    process.env.OKUVU_LATEST_VERSION_CODE = '-4';
    const app = buildApp();

    const body = (
      await app.inject({ method: 'GET', url: '/app/version' })
    ).json();

    expect(body.minimumSupportedVersionCode).toBe(14);
    expect(body.latestVersionCode).toBe(22);
    await app.close();
  });
});
