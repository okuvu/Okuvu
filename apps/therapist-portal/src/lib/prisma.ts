import { PrismaClient } from '@okuvu/prisma';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

const globalForPrisma = globalThis as { prisma?: PrismaClient };

/**
 * pg >= 8.16 makes `sslmode=require` mean verify-full (full chain + hostname
 * verification). The RDS chain is not in this image's trust store, so every
 * query failed with "self-signed certificate in certificate chain" after
 * PRISMA_OK-style startup checks had already passed (the adapter connects
 * lazily, so the failure only shows up on the first real query).
 *
 * Prisma's own CLI applies libpq semantics to `require` (encrypt, do not verify
 * the chain). `uselibpqcompat=true` gives the pg driver the same behaviour so
 * runtime and migrations agree. Traffic stays encrypted; it is not verified.
 *
 * Follow-up: ship the RDS CA bundle and move to sslmode=verify-full.
 * See evidence/E16-S4.md.
 */
function libpqCompatibleDatabaseUrl(raw: string): string {
  try {
    const url = new URL(raw);
    if (url.searchParams.get('sslmode') === 'require' && !url.searchParams.has('uselibpqcompat')) {
      url.searchParams.set('uselibpqcompat', 'true');
    }
    return url.toString();
  } catch {
    // A malformed URL must surface as a connection error, not be rewritten.
    return raw;
  }
}

function prismaClientSingleton(): PrismaClient | null {
  const url = process.env.DATABASE_URL;
  if (!url || url.trim() === '') {
    return null;
  }
  if (!globalForPrisma.prisma) {
    const pool = new Pool({ connectionString: libpqCompatibleDatabaseUrl(url) });

    // Neon suspends idle compute; without this handler, an idle client dropped by
    // the server crashes the process via an unhandled 'error' event on the pool.
    pool.on('error', (err) => {
      console.error('Unexpected error on idle Postgres client', err);
    });

    const adapter = new PrismaPg(pool);
    globalForPrisma.prisma = new PrismaClient({ adapter });
  }
  return globalForPrisma.prisma;
}

export const prisma = prismaClientSingleton();