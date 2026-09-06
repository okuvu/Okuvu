/**
 * Minimal in-memory rate limiter for tRPC mutations (F-11).
 *
 * This is a best-effort throttle, not a hard guarantee: on a multi-instance
 * serverless deployment (e.g. Vercel), each invocation can land on a
 * different instance with its own in-memory Map, so a determined caller can
 * exceed the nominal limit by spreading requests across instances. It still
 * closes the "no limit at all" gap for the common case (a single warm
 * instance handling bursty/duplicate clicks or a runaway client). Replace
 * with a shared store (Upstash/Redis) if abuse becomes a real concern.
 */

const hits = new Map<string, number[]>();

export function checkRateLimit(
  key: string,
  max: number,
  windowMs: number,
): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  recent.push(now);
  hits.set(key, recent);
  return recent.length <= max;
}
