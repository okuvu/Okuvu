import { getRedisClient } from './redis.js';

/**
 * Fixed-window request counter, backed by the shared Redis instance so the
 * limit holds across horizontally-scaled Cloud Run instances (an in-memory
 * Map per instance, the pattern used elsewhere in this codebase, silently
 * stops working the moment there's more than one instance).
 *
 * Fails OPEN: if Redis is unreachable, requests are allowed rather than
 * blocked. Rate limiting is a cost/abuse guard, not a correctness
 * guarantee — a Redis outage degrading to "unlimited" is much better than
 * it taking the whole product down. Mirrors the fail-open philosophy
 * A9-post already uses under S0/S1 timeouts (pipeline/orchestrator.ts).
 */
export async function checkRateLimit(
  key: string,
  max: number,
  windowSeconds: number,
): Promise<boolean> {
  const redis = getRedisClient();
  if (!redis) return true;

  try {
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, windowSeconds);
    }
    return count <= max;
  } catch (err) {
    console.error({ err, key }, 'Rate limit check failed, failing open');
    return true;
  }
}
