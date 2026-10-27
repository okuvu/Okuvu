import Fastify from 'fastify';
import fastifyRateLimit from '@fastify/rate-limit';
import { errorHandler } from './errors/handler.js';
import { registerRoutes } from './routes/index.js';
import { validateQueueConfig } from './lib/summary-enqueue.js';
import { validateAwsConfig } from './lib/provider-config.js';
import { getRedisClient } from './lib/redis.js';

const LOAD_TEST_MODE = process.env.LOAD_TEST_MODE === 'true';
const LOAD_TEST_KEY = process.env.LOAD_TEST_KEY;

export function buildApp() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
    },
    // The ALB terminates TLS and proxies every request, setting
    // X-Forwarded-For to the real client IP. Without this, request.ip is the
    // ALB's address for every request — identical for all callers — which
    // would make the IP-keyed rate limiter below useless (one shared bucket
    // for everyone) instead of broken-safe.
    trustProxy: true,
  });

  // Boot-time config validation: SQS is the only queue transport and Cognito
  // the only identity provider, so anything reported here is genuinely
  // unconfigured rather than "the other cloud's switch is off".
  const missingSqs = validateAwsConfig();
  if (missingSqs.length > 0) {
    app.log.warn({ event: 'config_validation', missing_vars: missingSqs }, 'AWS providers are not fully configured — summary enqueue and/or token verification will fail');
  }
  const missingQueue = validateQueueConfig();
  if (missingQueue.length > 0) {
    app.log.warn({ event: 'config_validation', missing_vars: missingQueue }, 'SQS is not fully configured — summary enqueue will be skipped');
  }

  if (!process.env.REDIS_URL) {
    app.log.warn({ event: 'config_validation' }, 'REDIS_URL is not set — rate limiting will use an in-process store (does not hold across multiple ECS tasks)');
  }

  // Coarse, IP-keyed guard against unbounded request volume from a single
  // source — LLM-cost and DB-load exposure the audit flagged as a P0 gap.
  // Redis-backed (falls back to @fastify/rate-limit's own in-memory store
  // if REDIS_URL isn't set, which is fine for local dev but not for a
  // horizontally-scaled deployment) so the limit holds across instances.
  // This is deliberately a blunt, global backstop; the WebSocket chat
  // path's per-message LLM cost is throttled separately and more tightly,
  // per authenticated user, in routes/websocket.ts — Fastify's HTTP
  // request lifecycle (and this plugin) never sees individual messages
  // sent over an already-open WebSocket connection.
  app.register(fastifyRateLimit, {
    global: true,
    max: 300,
    timeWindow: '1 minute',
    redis: getRedisClient() ?? undefined,
    skipOnError: true,
    allowList: (request) => {
      if (!LOAD_TEST_MODE || !LOAD_TEST_KEY) return false;
      return request.headers['x-load-test-key'] === LOAD_TEST_KEY;
    },
  });

  app.setErrorHandler(errorHandler);

  app.register(registerRoutes);

  return app;
}
