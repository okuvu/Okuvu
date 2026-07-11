import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Neon suspends idle compute; without this handler, an idle client dropped by
// the server crashes the process via an unhandled 'error' event on the pool.
pool.on('error', (err) => {
  console.error('Unexpected error on idle Postgres client', err);
});

const adapter = new PrismaPg(pool);

export const prisma = new PrismaClient({
  adapter,
  log: process.env.PRISMA_LOG_QUERIES === 'true' ? ['query'] : undefined,
});
