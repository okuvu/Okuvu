import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';
import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../../.env') });

function checkProductionBypass(
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

const PORT = parseInt(process.env.PORT ?? '8080', 10);
const HOST = process.env.HOST ?? '0.0.0.0';
const NODE_ENV = process.env.NODE_ENV ?? 'development';
const LOCAL_DEV_BYPASS_AUTH = process.env.LOCAL_DEV_BYPASS_AUTH;

checkProductionBypass(NODE_ENV, LOCAL_DEV_BYPASS_AUTH);

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

interface TaskPayload {
  [key: string]: unknown;
}

function isTaskPayload(value: unknown): value is TaskPayload {
  if (typeof value !== 'object' || value === null) return false;
  return true;
}

function parseBody(request: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf-8');
      if (!raw) {
        resolve(null);
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    request.on('error', reject);
  });
}

async function handleHealth(response: ServerResponse): Promise<void> {
  response.writeHead(200, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify({ status: 'ok' }));
}

async function handleTask(request: IncomingMessage, response: ServerResponse): Promise<void> {
  let body: unknown;
  try {
    body = await parseBody(request);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to parse body';
    response.writeHead(400, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ error: message }));
    return;
  }

  if (body !== null && !isTaskPayload(body)) {
    response.writeHead(400, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ error: 'Invalid payload structure' }));
    return;
  }

  const taskName = request.headers['x-cloudtasks-taskname'] ?? 'unknown';
  console.log({ taskName, payload: body }, 'Task received');
  console.log('Task acknowledged');
  response.writeHead(200, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify({ status: 'acknowledged' }));
}

async function main(): Promise<void> {
  console.log({ NODE_ENV, bypassEnabled: LOCAL_DEV_BYPASS_AUTH === 'true' }, 'Starting worker');

  try {
    await prisma.$connect();
    console.log('Database connection established');
  } catch (err) {
    console.error({ err }, 'Database connection failed');
    throw err;
  }

  const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
    if (request.method === 'GET' && request.url === '/health') {
      await handleHealth(response);
      return;
    }

    if (request.method === 'POST') {
      await handleTask(request, response);
      return;
    }

    response.writeHead(405, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ error: 'Method not allowed' }));
  });

  process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down gracefully...');
    server.close();
    await prisma.$disconnect();
    process.exit(0);
  });

  server.listen(PORT, HOST, () => {
    console.log({ PORT, HOST }, 'Worker listening');
  });
}

const isMainModule = process.argv[1] &&
  realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url));

if (isMainModule) {
  main().catch((err) => {
    console.error('Failed to start worker:', err);
    process.exit(1);
  });
}
