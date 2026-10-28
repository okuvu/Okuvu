import { describe, it, expect, afterEach } from 'vitest';
import { buildApp } from '../app.js';

const ORIGINAL_COMMIT = process.env.GIT_COMMIT;

afterEach(() => {
  if (ORIGINAL_COMMIT === undefined) {
    delete process.env.GIT_COMMIT;
  } else {
    process.env.GIT_COMMIT = ORIGINAL_COMMIT;
  }
});

describe('GET /health', () => {
  it('returns 200 with status ok and ISO timestamp', async () => {
    const app = buildApp();

    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body).toHaveProperty('status', 'ok');
    expect(body).toHaveProperty('timestamp');
    expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);

    await app.close();
  });

  it('does not require authentication', async () => {
    const app = buildApp();

    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);

    await app.close();
  });

  // E15-S4: the deployed commit must be observable from outside the task, so
  // a rollout can be verified against the image tag without console access.
  it('reports the GIT_COMMIT env var as the commit field', async () => {
    process.env.GIT_COMMIT = '41c5a5a9862b';
    const app = buildApp();

    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body).toHaveProperty('commit', '41c5a5a9862b');
    // The pre-existing contract must survive: status and timestamp stay put.
    expect(body).toHaveProperty('status', 'ok');
    expect(body).toHaveProperty('timestamp');

    await app.close();
  });

  it("falls back to 'unknown' when GIT_COMMIT is unset", async () => {
    delete process.env.GIT_COMMIT;
    const app = buildApp();

    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body).toHaveProperty('commit', 'unknown');
    expect(body).toHaveProperty('status', 'ok');

    await app.close();
  });

  it("falls back to 'unknown' when GIT_COMMIT is blank", async () => {
    process.env.GIT_COMMIT = '   ';
    const app = buildApp();

    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveProperty('commit', 'unknown');

    await app.close();
  });
});
