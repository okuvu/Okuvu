import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import crypto from 'crypto';

const ORIGINAL_ENV = { ...process.env };

const hasRealDb = Boolean(process.env.DATABASE_URL);
const describeIf = hasRealDb ? describe : describe.skip;

// Each concurrency case runs its acquire attempts in SEPARATE interactive
// transactions (one DB connection each), so queries genuinely contend on the
// SessionLimit unique index instead of being serialized over a single
// transaction connection. Long budgets absorb row-lock waits on slow CI DBs.
const TX_OPTIONS = { maxWait: 30_000, timeout: 60_000 } as const;
const AC4_BASE_DATE = '2026-07-18';
// Benchmark-free date roll for AC#4: distinct date per run, no per-run cleanup.
function addDays(base: string, days: number): string {
  const d = new Date(`${base}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

describeIf('Rate Limiter Concurrency (Real DB)', () => {
  let prisma: PrismaClient;
  const testUserId = `test-${crypto.randomUUID()}`;

  beforeAll(async () => {
    process.env = {
      ...ORIGINAL_ENV,
      SESSION_LIMIT_SD_DAILY: '1',
      SESSION_LIMIT_TL_DAILY: '2',
    };

    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const adapter = new PrismaPg(pool);
    prisma = new PrismaClient({ adapter });

    await prisma.user.create({
      data: {
        id: testUserId,
        firebase_uid: `firebase-${testUserId}`,
        phone_number: '+910000000000',
      },
    });
  });

  afterAll(async () => {
    await prisma.sessionLimit.deleteMany({ where: { user_id: { startsWith: 'test-' } } });
    await prisma.user.deleteMany({ where: { id: { startsWith: 'test-' } } });
    await prisma.$disconnect();
    process.env = { ...ORIGINAL_ENV };
  });

  beforeEach(async () => {
    await prisma.sessionLimit.deleteMany({ where: { user_id: testUserId } });
  });

  async function importTryAcquireSessionSlot() {
    const mod = await import('../lib/session-limits.js');
    return mod.tryAcquireSessionSlot as typeof import('../lib/session-limits.js')['tryAcquireSessionSlot'];
  }

  async function tryAcquireWithoutWhereGuard(
    tx: any,
    userId: string,
    tier: string,
    dateIst: string,
    _dailyLimit: number,
  ): Promise<{ allowed: boolean; sessions_used: number }> {
    const [row] = await tx.$queryRaw<Array<{ sessions_used: bigint }>>`
      INSERT INTO "SessionLimit" (id, user_id, tier, date_ist, sessions_used, updated_at)
      VALUES (gen_random_uuid(), ${userId}, ${tier}::"Tier", ${dateIst}::date, 1, NOW())
      ON CONFLICT (user_id, date_ist)
      DO UPDATE SET sessions_used = "SessionLimit".sessions_used + 1, updated_at = NOW()
      RETURNING sessions_used
    `;
    return { allowed: true, sessions_used: Number(row.sessions_used) };
  }

  it('QA Edge: exactly one of two concurrent SD requests succeeds (atomic upsert)', async () => {
    const tryAcquire = await importTryAcquireSessionSlot();
    const dateIst = '2026-07-16';

    const [r1, r2] = await Promise.all([
      prisma.$transaction((tx) => tryAcquire(tx, testUserId, 'SD', dateIst, 1), TX_OPTIONS),
      prisma.$transaction((tx) => tryAcquire(tx, testUserId, 'SD', dateIst, 1), TX_OPTIONS),
    ]);

    const allowed = [r1, r2].filter((r) => r.allowed);
    const denied = [r1, r2].filter((r) => !r.allowed);

    expect(allowed).toHaveLength(1);
    expect(denied).toHaveLength(1);
    expect(allowed[0].sessions_used).toBe(1);
  });

  it('TL tier: exactly two of three concurrent TL requests succeed (limit=2)', async () => {
    const tryAcquire = await importTryAcquireSessionSlot();
    const dateIst = '2026-07-16';

    const [r1, r2, r3] = await Promise.all([
      prisma.$transaction((tx) => tryAcquire(tx, testUserId, 'TL', dateIst, 2), TX_OPTIONS),
      prisma.$transaction((tx) => tryAcquire(tx, testUserId, 'TL', dateIst, 2), TX_OPTIONS),
      prisma.$transaction((tx) => tryAcquire(tx, testUserId, 'TL', dateIst, 2), TX_OPTIONS),
    ]);

    const allowed = [r1, r2, r3].filter((r) => r.allowed);
    const denied = [r1, r2, r3].filter((r) => !r.allowed);

    expect(allowed).toHaveLength(2);
    expect(denied).toHaveLength(1);
  });

  it('AC #2: non-atomic read-then-write fails concurrency (proves test is non-vacuous)', async () => {
    const dateIst = '2026-07-17';
    const naUserId = `test-${crypto.randomUUID()}`;
    await prisma.user.create({
      data: {
        id: naUserId,
        firebase_uid: `firebase-${naUserId}`,
        phone_number: '+910000000000',
      },
    });

    const [r1, r2] = await Promise.all([
      prisma.$transaction((tx) => tryAcquireWithoutWhereGuard(tx, naUserId, 'SD', dateIst, 1), TX_OPTIONS),
      prisma.$transaction((tx) => tryAcquireWithoutWhereGuard(tx, naUserId, 'SD', dateIst, 1), TX_OPTIONS),
    ]);

    await prisma.sessionLimit.deleteMany({ where: { user_id: naUserId } });
    await prisma.user.delete({ where: { id: naUserId } });

    const allowed = [r1, r2].filter((r) => r.allowed);
    expect(allowed).toHaveLength(2);
  });

  it('AC #4: concurrency test passes reliably across 20 consecutive runs', async () => {
    const tryAcquire = await importTryAcquireSessionSlot();

    for (let run = 0; run < 20; run++) {
      const dateIst = addDays(AC4_BASE_DATE, run);

      const [r1, r2] = await Promise.all([
        prisma.$transaction((tx) => tryAcquire(tx, testUserId, 'SD', dateIst, 1), TX_OPTIONS),
        prisma.$transaction((tx) => tryAcquire(tx, testUserId, 'SD', dateIst, 1), TX_OPTIONS),
      ]);

      const allowed = [r1, r2].filter((r) => r.allowed);
      const denied = [r1, r2].filter((r) => !r.allowed);

      expect(allowed).toHaveLength(1);
      expect(denied).toHaveLength(1);
      expect(allowed[0].sessions_used).toBe(1);
    }
  }, 60_000);
});
