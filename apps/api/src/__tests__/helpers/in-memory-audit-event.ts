import type { AuditEvent } from '../../lib/audit-chain.js';

/**
 * E17-S4 — an in-memory stand-in for the `auditEvent` Prisma delegate.
 *
 * There is no Postgres in the test environment, and every other suite mocks
 * `../lib/prisma.js`, so the audit chain had to be testable without one. This
 * delegate mirrors the parts of `model AuditEvent` the chain uses
 * (`findFirst`, `create`, `findMany`) *including* the two UNIQUE constraints
 * from the migration (`seq` primary key, `prev_hash`, `hash`), so the
 * head-race retry in `lib/audit-log.ts` is exercised rather than assumed.
 *
 * It is deliberately not a general Prisma fake: it stores exactly the columns
 * the migration creates, in the order Postgres would return them.
 */

export interface AuditRow extends AuditEvent {
  body: string;
}

type Select = Record<string, boolean>;

function project<T extends Record<string, unknown>>(row: T, select?: Select): Partial<T> {
  if (!select) return { ...row };
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(select)) {
    if (select[key]) out[key] = row[key];
  }
  return out as Partial<T>;
}

export function makeAuditEventDelegate() {
  const rows: AuditRow[] = [];

  return {
    /** Direct access for assertions — the rows as stored. */
    rows,

    findFirst: async (args?: { orderBy?: { seq?: 'asc' | 'desc' }; select?: Select }) => {
      const ordered = [...rows].sort((a, b) =>
        args?.orderBy?.seq === 'desc' ? b.seq - a.seq : a.seq - b.seq,
      );
      const row = ordered[0];
      return row ? project(row as unknown as Record<string, unknown>, args?.select) : null;
    },

    create: async (args: { data: AuditRow; select?: Select }) => {
      const { data } = args;
      const conflict =
        rows.some((r) => r.seq === data.seq) ||
        rows.some((r) => r.prev_hash === data.prev_hash) ||
        rows.some((r) => r.hash === data.hash);
      if (conflict) {
        const err = new Error('Unique constraint failed') as Error & { code: string };
        err.code = 'P2002';
        throw err;
      }
      const row: AuditRow = { ...data, detail: data.detail ?? {} };
      rows.push(row);
      return project(row as unknown as Record<string, unknown>, args.select);
    },

    findMany: async (args?: { orderBy?: { seq?: 'asc' | 'desc' } }) => {
      const ordered = [...rows].sort((a, b) =>
        args?.orderBy?.seq === 'desc' ? b.seq - a.seq : a.seq - b.seq,
      );
      return ordered.map((row) => ({ ...row }));
    },

    reset: () => {
      rows.length = 0;
    },
  };
}
