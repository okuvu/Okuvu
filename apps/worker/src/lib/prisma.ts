import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

/**
 * pg >= 8.16 changed `sslmode=require` to mean verify-full (full chain +
 * hostname verification). The RDS instance's chain is not in the runtime
 * image's trust store, so this worker's /health `SELECT 1` failed with
 * "Error opening a TLS connection: self-signed certificate in certificate
 * chain" and the api logged "Worker process is up but its database check
 * failed" on every boot.
 *
 * Prisma's own engine (the CLI that runs `prisma migrate deploy`) still applies
 * libpq semantics to `require`: encrypt, do not verify the chain. Passing
 * `uselibpqcompat=true` gives the pg driver the same behaviour, so runtime and
 * migrations agree. The connection stays encrypted; it is not verified.
 *
 * Follow-up: ship the RDS CA bundle in the image and move to
 * `sslmode=verify-full`. See evidence/E16-S4.md.
 */
function libpqCompatibleDatabaseUrl(raw: string | undefined): string | undefined {
  if (!raw) return raw;
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

let _prisma: PrismaClient | undefined;

export function getPrisma(): PrismaClient {
  if (!_prisma) {
    const pool = new Pool({ connectionString: libpqCompatibleDatabaseUrl(process.env.DATABASE_URL) });

    // Neon suspends idle compute; without this handler, an idle client dropped by
    // the server crashes the process via an unhandled 'error' event on the pool.
    pool.on('error', (err) => {
      console.error('Unexpected error on idle Postgres client', err);
    });

    const adapter = new PrismaPg(pool);
    _prisma = new PrismaClient({ adapter });
  }
  return _prisma;
}
