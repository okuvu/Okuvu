// Must be the first import: ESM hoists all static imports above this file's own
// top-level code, so any later-imported module (e.g. ./app.js -> ./lib/prisma.js,
// which reads process.env.DATABASE_URL at import time) would otherwise evaluate
// before dotenv had a chance to populate process.env.
import './env.js';

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';
import { checkProductionBypass } from './lib/check-production-bypass.js';

const PORT = parseInt(process.env.PORT ?? '8080', 10);
const HOST = process.env.HOST ?? '0.0.0.0';

const NODE_ENV = process.env.NODE_ENV ?? 'development';
const LOCAL_DEV_BYPASS_AUTH = process.env.LOCAL_DEV_BYPASS_AUTH;

try {
  checkProductionBypass(NODE_ENV, LOCAL_DEV_BYPASS_AUTH);
} catch (err) {
  console.error(
    'FATAL: ' + (err instanceof Error ? err.message : String(err)),
  );
  process.exit(1);
}

import { buildApp } from './app.js';
import { prisma } from './lib/prisma.js';
import { assertWorkerReachable } from './lib/worker-health.js';

async function checkDatabaseConnection(app: ReturnType<typeof buildApp>): Promise<void> {
  try {
    await prisma.$connect();
    app.log.info('Database connection established');
  } catch (err) {
    app.log.error({ err }, 'Database connection failed');
    throw err;
  }
}

async function main() {
  const app = buildApp();

  app.log.info(
    { NODE_ENV, bypassEnabled: LOCAL_DEV_BYPASS_AUTH === 'true' },
    'Starting server',
  );

  await checkDatabaseConnection(app);

  // A1 (OKUVU — Plumbing Fixes & Rationale v1.0): fail startup loudly when the
  // summary/memory worker is unreachable. Without it, session summaries and
  // memory extraction never run and A2 has no continuity to read — the
  // structural root of the reset-on-affirmation failures. Deliberately AFTER
  // the DB check so the error message names the right missing dependency.
  await assertWorkerReachable(app.log);

  process.on('SIGTERM', async () => {
    app.log.info('Shutting down gracefully');
    await app.close();
    process.exit(0);
  });

  await app.listen({ port: PORT, host: HOST });
}

const isMainModule = process.argv[1] &&
  realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url));

if (isMainModule) {
  main().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}
