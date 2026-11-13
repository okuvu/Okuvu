import { PrismaClient } from '@okuvu/prisma';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

const globalForPrisma = globalThis as { prisma?: PrismaClient };

/**
 * pg >= 8.16 changed `sslmode=require` to mean verify-full (full chain +
 * hostname verification). The RDS instance's chain is not in the runtime
 * image's trust store, so every query fails with "Error opening a TLS
 * connection: self-signed certificate in certificate chain" — and Postgres
 * logs it from the other side as "could not accept SSL connection: EOF
 * detected", because the client tears the socket down mid-handshake.
 *
 * apps/api, apps/worker and apps/therapist-portal all wrap their URL this way
 * (commit 03138c0, evidence/E16-S4.md). The harness was the one Prisma entry
 * point that never adopted it, so its DB-backed procedures returned 500 while
 * its health check and page shells stayed 200 (Prisma's adapter connects
 * lazily). Keep this in sync with the other three; deleting it re-breaks every
 * dashboard/simulator query.
 *
 * Follow-up (same as api): ship the RDS CA bundle and move to verify-full.
 */
function libpqCompatibleDatabaseUrl(raw: string): string {
  try {
    const url = new URL(raw);
    if (url.searchParams.get('sslmode') === 'require' && !url.searchParams.has('uselibpqcompat')) {
      url.searchParams.set('uselibpqcompat', 'true');
    }
    return url.toString();
  } catch {
    // Leave anything unparseable untouched: a malformed URL should surface as a
    // connection error, not as a silently rewritten host.
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
