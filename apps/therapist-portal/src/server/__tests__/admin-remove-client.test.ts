import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { PrismaClient } from '@okuvu/prisma';
import { appRouter } from '../routers/_app';

/**
 * `admin.removeClient` — the console's only destructive action.
 *
 * Two things these assert. First, scope: the delete must be pinned to the one
 * client id, and the string-keyed tables (GovernanceLog, BetaConsent,
 * WaitlistEntry) must be swept with that subject's own identifiers only — an
 * empty value leaking into the filter is how a removal becomes a mass delete.
 * Second, coverage: the FK graph is left to the database cascade, so the schema
 * itself has to keep every relation to `User` at `onDelete: Cascade`. That
 * assertion reads the real schema.prisma and fails on the commit that adds a
 * relation which would otherwise survive a removal.
 */

const ADMIN = { id: 'admin_1', email: 'admin@okuvu.in', name: 'Admin' };
const THERAPIST = { id: 'th_1', email: 'therapist@okuvu.dev', name: 'Dr. Therapist' };
const ORIGINAL_ADMIN_EMAILS = process.env.ADMIN_EMAILS;

const CLIENT = {
  id: 'client_1',
  email: 'asha@example.com',
  phone_number: '+919876543210',
  full_name: 'Asha Menon',
  auth_subject: 'cognito-sub-1',
};

function buildTx(overrides: Record<string, unknown> = {}) {
  return {
    sessionLog: {
      findMany: vi.fn().mockResolvedValue([{ id: 's1' }, { id: 's2' }]),
    },
    governanceLog: { deleteMany: vi.fn().mockResolvedValue({ count: 4 }) },
    betaConsent: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
    waitlistEntry: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
    turn: { count: vi.fn().mockResolvedValue(37) },
    moodLog: { count: vi.fn().mockResolvedValue(6) },
    appointment: { count: vi.fn().mockResolvedValue(2) },
    therapistNote: { count: vi.fn().mockResolvedValue(3) },
    therapistClient: { count: vi.fn().mockResolvedValue(1) },
    journalEntry: { count: vi.fn().mockResolvedValue(5) },
    homework: { count: vi.fn().mockResolvedValue(2) },
    inviteToken: { count: vi.fn().mockResolvedValue(1) },
    user: { delete: vi.fn().mockResolvedValue({ id: CLIENT.id }) },
    ...overrides,
  };
}

function buildPrisma(opts: { client?: unknown; openSession?: unknown; tx?: ReturnType<typeof buildTx> } = {}) {
  const tx = opts.tx ?? buildTx();
  const prisma = {
    user: {
      findUnique: vi.fn().mockResolvedValue('client' in opts ? opts.client : CLIENT),
    },
    sessionLog: {
      findFirst: vi.fn().mockResolvedValue(opts.openSession ?? null),
    },
    $transaction: vi.fn(async (cb: (client: unknown) => unknown) => cb(tx)),
    __tx: tx,
  };
  return prisma as unknown as PrismaClient & { __tx: ReturnType<typeof buildTx> };
}

function caller(prisma: PrismaClient, asAdmin = true) {
  const identity = asAdmin ? ADMIN : THERAPIST;
  return appRouter.createCaller({
    session: { user: { id: identity.id, email: identity.email, name: identity.name } },
    prisma,
    headers: new Headers(),
  });
}

/** First-call args of a mocked delegate method, typed loosely on purpose. */
function argsOf(fn: unknown): Record<string, unknown> {
  return (fn as { mock: { calls: [Record<string, unknown>][] } }).mock.calls[0][0];
}

beforeEach(() => {
  process.env.ADMIN_EMAILS = 'admin@okuvu.in';
});

afterEach(() => {
  if (ORIGINAL_ADMIN_EMAILS === undefined) delete process.env.ADMIN_EMAILS;
  else process.env.ADMIN_EMAILS = ORIGINAL_ADMIN_EMAILS;
});

describe('removeClient — access', () => {
  it('refuses a signed-in non-admin and touches nothing', async () => {
    const prisma = buildPrisma();
    await expect(caller(prisma, false).admin.removeClient({ clientUserId: CLIENT.id })).rejects.toThrow(
      /Admin access required/,
    );
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('removeClient — the delete it performs', () => {
  it('deletes the user row and reports what went with it', async () => {
    const prisma = buildPrisma();
    const result = await caller(prisma).admin.removeClient({ clientUserId: CLIENT.id });

    expect(prisma.__tx.user.delete).toHaveBeenCalledWith({ where: { id: CLIENT.id } });
    expect(result).toMatchObject({
      removed: true,
      clientId: CLIENT.id,
      label: 'Asha Menon',
      erased: {
        turns: 37,
        sessions: 2,
        moodCheckins: 6,
        appointments: 2,
        notes: 3,
        assignments: 1,
        journalEntries: 5,
        homework: 2,
        invites: 1,
        governanceEvents: 4,
        betaConsents: 1,
        waitlistEntries: 1,
      },
    });
  });

  it('sweeps the tables the FK cascade cannot reach, scoped to this subject', async () => {
    const prisma = buildPrisma();
    await caller(prisma).admin.removeClient({ clientUserId: CLIENT.id });
    const tx = prisma.__tx;

    // GovernanceLog has no FK to User — it is reached through this subject's
    // own session ids, and no others.
    expect(argsOf(tx.governanceLog.deleteMany)).toEqual({ where: { session_id: { in: ['s1', 's2'] } } });

    // BetaConsent.user_ref is a bare string that may hold the id, the email or
    // the auth subject — all three, and nothing else.
    expect(argsOf(tx.betaConsent.deleteMany)).toEqual({
      where: { user_ref: { in: [CLIENT.id, CLIENT.email, CLIENT.auth_subject] } },
    });

    // WaitlistEntry is keyed by whatever the person typed before they had an
    // account.
    expect(argsOf(tx.waitlistEntry.deleteMany)).toEqual({
      where: {
        OR: [{ email: CLIENT.email }, { phone_number: CLIENT.phone_number }],
      },
    });
  });

  it('never turns a missing identifier into a NULL filter', async () => {
    const prisma = buildPrisma({
      client: {
        id: 'client_2',
        email: null,
        phone_number: '+919000000000',
        full_name: null,
        auth_subject: null,
      },
    });

    const result = await caller(prisma).admin.removeClient({ clientUserId: 'client_2' });
    const tx = prisma.__tx;

    // Only the values that exist. `{ email: undefined }` reaching Prisma is how
    // a scoped delete silently becomes an unscoped one.
    expect(argsOf(tx.betaConsent.deleteMany)).toEqual({ where: { user_ref: { in: ['client_2'] } } });
    expect(argsOf(tx.waitlistEntry.deleteMany)).toEqual({
      where: { OR: [{ phone_number: '+919000000000' }] },
    });
    // No name and no email: the operator-facing label falls back rather than
    // printing "null".
    expect(result.label).toBe('this client');
  });

  it('does not delete a user it cannot find', async () => {
    const prisma = buildPrisma({ client: null });
    await expect(caller(prisma).admin.removeClient({ clientUserId: 'nope' })).rejects.toThrow(
      /No client with that id/,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuses while the client has a conversation open', async () => {
    const prisma = buildPrisma({ openSession: { id: 's_open' } });
    await expect(caller(prisma).admin.removeClient({ clientUserId: CLIENT.id })).rejects.toThrow(
      /conversation open right now/,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect((prisma.$transaction as unknown as { mock: { calls: unknown[] } }).mock.calls).toHaveLength(0);
  });
});

/**
 * The cascade is the coverage argument, so it has to be checked against the
 * schema rather than asserted in a comment. Same parse as
 * `apps/api/src/__tests__/account-delete.test.ts` §erasure coverage.
 */
describe('removal coverage vs packages/prisma/schema.prisma', () => {
  const schemaPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../../../../packages/prisma/schema.prisma',
  );
  const schema = readFileSync(schemaPath, 'utf8');
  const models = [...schema.matchAll(/^model (\w+) \{\n([\s\S]*?)^\}/gm)].map((m) => ({
    name: m[1],
    body: m[2],
  }));

  it('finds the schema', () => {
    expect(models.length).toBeGreaterThan(30);
  });

  it('every relation to User still cascades, so a hard delete cannot orphan a row', () => {
    const offenders: string[] = [];
    for (const model of models) {
      for (const line of model.body.split('\n')) {
        if (!/\bUser\s+@relation\(/.test(line)) continue;
        if (!/onDelete:\s*Cascade/.test(line)) offenders.push(`${model.name}: ${line.trim()}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the three string-keyed tables are still the ones that need sweeping by hand', () => {
    // If either of these grows a real FK to User, the manual sweep is redundant;
    // if the set changes, removeClient's scoping has to change with it.
    for (const name of ['GovernanceLog', 'BetaConsent', 'WaitlistEntry']) {
      const model = models.find((m) => m.name === name);
      expect(model, `${name} is missing from the schema`).toBeDefined();
      expect(/\bUser\s+@relation\(/.test(model!.body)).toBe(false);
    }
  });
});
