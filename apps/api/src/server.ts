import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../../.env') });

export function checkProductionBypass(
  nodeEnv: string | undefined,
  bypassFlag: string | undefined,
): void {
  if (nodeEnv === 'production' && bypassFlag === 'true') {
    console.error(
      'FATAL: LOCAL_DEV_BYPASS_AUTH is set to "true" in NODE_ENV=production. ' +
      'This would leave the entire API unprotected. Refusing to start.',
    );
    process.exit(1);
  }
}

const PORT = parseInt(process.env.PORT ?? '8080', 10);
const HOST = process.env.HOST ?? '0.0.0.0';

const NODE_ENV = process.env.NODE_ENV ?? 'development';
const LOCAL_DEV_BYPASS_AUTH = process.env.LOCAL_DEV_BYPASS_AUTH;

checkProductionBypass(NODE_ENV, LOCAL_DEV_BYPASS_AUTH);

import { buildApp } from './app.js';
import { prisma } from './lib/prisma.js';
import { validateSessionConfig } from './lib/session-limits.js';

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
  validateSessionConfig();

  const app = buildApp();

  app.log.info(
    { NODE_ENV, bypassEnabled: LOCAL_DEV_BYPASS_AUTH === 'true' },
    'Starting server',
  );

  await checkDatabaseConnection(app);

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
