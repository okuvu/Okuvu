import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../../.env') });

export function checkProductionBypass(
  nodeEnv: string | undefined,
  bypassFlag: string | undefined,
): void {
  if (nodeEnv === 'production' && bypassFlag === 'true') {
    console.error(
      'FATAL: LOCAL_DEV_BYPASS_AUTH is set to "true" in NODE_ENV=production. ' +
      'This would leave the worker unprotected. Refusing to start.',
    );
    process.exit(1);
  }
}

const PORT = parseInt(process.env.WORKER_PORT ?? '3002', 10);
const HOST = process.env.HOST ?? '0.0.0.0';
const NODE_ENV = process.env.NODE_ENV ?? 'development';
const LOCAL_DEV_BYPASS_AUTH = process.env.LOCAL_DEV_BYPASS_AUTH;

checkProductionBypass(NODE_ENV, LOCAL_DEV_BYPASS_AUTH);

import { buildApp } from './app.js';
import {
  createSummaryConsumer,
  setActiveSummaryConsumer,
  type SummaryJobConsumer,
} from './lib/summary-consumer.js';

async function checkDatabaseConnection(): Promise<void> {
  const { getPrisma } = await import('./lib/prisma.js');
  await getPrisma().$connect();
}

let app: ReturnType<typeof buildApp> | undefined;
let summaryConsumer: SummaryJobConsumer | null = null;

async function main() {
  app = buildApp();

  app.log.info(
    { NODE_ENV, bypassEnabled: LOCAL_DEV_BYPASS_AUTH === 'true' },
    'Starting worker',
  );

  try {
    await checkDatabaseConnection();
    app.log.info('Database connection established');
  } catch (err) {
    app.log.error({ err }, 'Database connection failed');
    throw err;
  }

  await app.listen({ port: PORT, host: HOST });

  // A6: the worker is the *consumer* of summary jobs. Starting the poll loop
  // after `listen` means the api's boot probe (assertWorkerReachable) can never
  // be blocked by an SQS endpoint that is slow or throttling: `/health` is
  // answering before the first long poll begins.
  //
  // A null here is not fatal — the worker still serves `/health`,
  // `/tasks/summary` (local dev bypass, test harness) and the cleanup routes —
  // but it is logged as a warning naming the reason, because a worker that
  // answers health while consuming nothing is the exact state that hid this
  // bug for the whole beta.
  summaryConsumer = createSummaryConsumer(app.log);
  if (summaryConsumer) {
    setActiveSummaryConsumer(summaryConsumer);
    await summaryConsumer.start();
  }
}

process.on('SIGTERM', async () => {
  if (app) {
    app.log.info('SIGTERM received, shutting down gracefully...');
  }
  // Stop polling first, then disconnect: an in-flight summary must be allowed
  // to finish while Prisma is still connected, otherwise the row it is writing
  // fails and the message is redelivered for nothing.
  if (summaryConsumer) {
    await summaryConsumer.stop().catch(() => undefined);
    setActiveSummaryConsumer(null);
  }
  const { getPrisma } = await import('./lib/prisma.js');
  await getPrisma().$disconnect();
  process.exit(0);
});

const isMainModule = process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  main().catch((err) => {
    console.error('Failed to start worker:', err);
    process.exit(1);
  });
}
