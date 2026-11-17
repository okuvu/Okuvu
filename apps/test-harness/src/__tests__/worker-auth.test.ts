import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { signWorkerAuthToken, workerAuthHeaders } from '@/lib/worker-auth';

/**
 * Producer side of the worker's internal auth. The verifier lives in
 * apps/worker/src/middleware/internal-auth.ts and expects
 * `v1.<unix-seconds>.<hex HMAC-SHA256 of "v1.<unix-seconds>">`. The two must
 * stay byte-identical: a mismatch surfaces as a 401 at session close, which
 * marks every conversation in a campaign INCOMPLETE.
 */

const SECRET = 'test-worker-secret';
const TS = 1_760_000_000;

describe('worker auth token', () => {
  it('produces the v1.<timestamp>.<hex> shape the worker parses', () => {
    const token = signWorkerAuthToken(SECRET, TS);
    expect(token).toMatch(/^v1\.\d{1,12}\.[0-9a-f]{64}$/);
    expect(token.startsWith(`v1.${TS}.`)).toBe(true);
  });

  it('signs the canonical string, not the body or the url', () => {
    const expected = createHmac('sha256', SECRET).update(`v1.${TS}`).digest('hex');
    expect(signWorkerAuthToken(SECRET, TS)).toBe(`v1.${TS}.${expected}`);
  });

  it('is deterministic for a given second and secret', () => {
    expect(signWorkerAuthToken(SECRET, TS)).toBe(signWorkerAuthToken(SECRET, TS));
  });

  it('changes with the secret — a wrong key cannot produce a valid token', () => {
    expect(signWorkerAuthToken('other-secret', TS)).not.toBe(signWorkerAuthToken(SECRET, TS));
  });

  it('changes with the timestamp, so a captured token ages out of the skew window', () => {
    expect(signWorkerAuthToken(SECRET, TS + 1)).not.toBe(signWorkerAuthToken(SECRET, TS));
  });

  it('sends a Bearer header when the secret is configured', () => {
    expect(workerAuthHeaders(SECRET, TS)).toEqual({ authorization: `Bearer ${signWorkerAuthToken(SECRET, TS)}` });
  });

  it('sends no header when the secret is missing, so the worker fails closed visibly', () => {
    expect(workerAuthHeaders(undefined, TS)).toEqual({});
    expect(workerAuthHeaders('   ', TS)).toEqual({});
  });
});
