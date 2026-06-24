import { describe, it, expect } from 'vitest';
import { buildApp } from '../app.js';

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
});
