import { describe, it, expect } from 'vitest';
import { buildApp } from '../app.js';

describe('error handler', () => {
  it('returns 500 for unhandled errors without crashing the server', async () => {
    const app = buildApp();

    app.get('/crash', {
      handler: async () => {
        throw new Error('Something went terribly wrong');
      },
    });

    const response = await app.inject({
      method: 'GET',
      url: '/crash',
    });

    expect(response.statusCode).toBe(500);

    const body = response.json();
    expect(body.error.code).toBe('INTERNAL_SERVER_ERROR');
    expect(body.error.message).toBe('An unexpected error occurred');

    const secondResponse = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(secondResponse.statusCode).toBe(200);

    await app.close();
  });
});
