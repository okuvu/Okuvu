import Redis from 'ioredis';

// Memorystore Redis — provisioned since the original infra setup
// specifically for session/request rate limiting (see .env.example,
// "MEMORYSTORE REDIS (Session rate limiting)"), but had zero consumers
// until this fix. Lazily created, memoized as a module-level singleton like
// lib/prisma.ts's Pool, and gracefully absent (null) when REDIS_URL isn't
// set — rate limiting degrades to fail-open (see lib/rate-limit.ts) rather
// than blocking local dev or crash-looping the process.
let client: Redis | null | undefined;

export function getRedisClient(): Redis | null {
  if (client !== undefined) return client;

  const url = process.env.REDIS_URL;
  if (!url) {
    client = null;
    return client;
  }

  client = new Redis(url, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    // Keeps retrying (so a real outage recovers on its own once Redis is
    // back) but backs off up to 30s instead of ioredis's tighter default —
    // this is an optional dependency in dev (no local Redis running is the
    // common case), not a crash condition, so it shouldn't hammer the log.
    retryStrategy: (times) => Math.min(times * 1000, 30000),
  });

  // Without this handler, a dropped connection crashes the process via an
  // unhandled 'error' event — same failure mode lib/prisma.ts already
  // guards against for Postgres. Rate limiting should degrade, not crash.
  // Logged once per disconnect rather than on every retry attempt — with
  // no Redis reachable this fires on a steady backoff forever, and a log
  // line every 30s reads as "still down," not as a flood.
  let lastLoggedAt = 0;
  client.on('error', (err) => {
    const now = Date.now();
    if (now - lastLoggedAt > 30000) {
      lastLoggedAt = now;
      console.error({ err }, 'Redis connection error');
    }
  });

  return client;
}
