import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildApp } from '../app.js';
import { SUBJECT_TABLES } from '../lib/account.js';

const ORIGINAL_ENV = { ...process.env };

// Every model that carries a FK to "User" (packages/prisma/schema.prisma),
// plus the two tables that reference the subject by string and the one that
// reaches it through a session id. Written out here rather than derived from
// SUBJECT_TABLES so that dropping a table from the implementation fails this
// file instead of silently shrinking the list.
// Declared inside vi.hoisted() because the vi.mock factory below is hoisted
// above every other top-level binding in this file.
const { USER_FK_TABLES, STRING_REF_TABLES, ALL_TABLES, prismaMock } = vi.hoisted(() => {
  const USER_FK_TABLES = [
    'emergencyContact',
    'engagementProfile',
    'clinicalConfig',
    'safetyState',
    'turn',
    'sessionSummary',
    'moodLog',
    'sessionLog',
    'journalEntry',
    'therapistNote',
    'homework',
    'reminder',
    'appointment',
    'clinicalAccessLog',
    'therapistClient',
    'userMemory',
    'inviteToken',
    'userToolPreference',
  ] as const;

  const STRING_REF_TABLES = ['governanceLog', 'betaConsent', 'waitlistEntry'] as const;

  const ALL_TABLES = [...USER_FK_TABLES, ...STRING_REF_TABLES];

  const prismaMock: Record<string, any> = {
    user: { findUnique: vi.fn(), update: vi.fn() },
    sessionLog: { findFirst: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn() },
    $transaction: vi.fn(),
  };

  for (const table of ALL_TABLES) {
    if (!prismaMock[table]) prismaMock[table] = {};
    prismaMock[table].deleteMany = vi.fn();
  }

  return { USER_FK_TABLES, STRING_REF_TABLES, ALL_TABLES, prismaMock };
});

vi.mock('../lib/prisma.js', () => ({ prisma: prismaMock }));

const MOCK_USER_ID = '550e8400-e29b-41d4-a716-446655440000';
const MOCK_AUTH_SUBJECT = 'dev-bypass-subject-1';
const MOCK_SESSION_ID = '660e8400-e29b-41d4-a716-446655440001';
const MOCK_EMAIL = 'subject@example.test';
const MOCK_PHONE = '+919000000001';

function validPayload() {
  return { confirm: true };
}

/** Transaction client that records the order of the deletes, per table. */
function makeTx() {
  const order: string[] = [];
  const tx: Record<string, any> = {};
  for (const table of ALL_TABLES) {
    tx[table] = {
      deleteMany: vi.fn().mockImplementation(async () => {
        order.push(table);
        return { count: 1 };
      }),
    };
  }
  tx.sessionLog.findMany = vi.fn().mockResolvedValue([{ id: MOCK_SESSION_ID }]);
  tx.user = { update: vi.fn().mockResolvedValue(undefined) };
  return { tx, order };
}

describe('POST /account/delete', () => {
  let app: ReturnType<typeof buildApp>;
  let tx: Record<string, any>;
  let order: string[];

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, LOCAL_DEV_BYPASS_AUTH: 'true' };
    const made = makeTx();
    tx = made.tx;
    order = made.order;

    prismaMock.user.findUnique.mockResolvedValue({
      id: MOCK_USER_ID,
      deleted_at: null,
      email: MOCK_EMAIL,
      phone_number: MOCK_PHONE,
      auth_subject: MOCK_AUTH_SUBJECT,
    });
    prismaMock.sessionLog.findFirst.mockResolvedValue(null);
    prismaMock.$transaction.mockImplementation(async (cb: any) => cb(tx));
    app = buildApp();
  });

  afterEach(async () => {
    if (app) await app.close();
    process.env = { ...ORIGINAL_ENV };
    vi.clearAllMocks();
  });

  function deleteViaRoute() {
    return app.inject({
      method: 'POST',
      url: '/account/delete',
      payload: validPayload(),
    });
  }

  describe('positive — valid deletion request', () => {
    it('returns 200 with success', async () => {
      const response = await deleteViaRoute();
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ success: true });
    });

    it('erases rows from every table that references the subject', async () => {
      await deleteViaRoute();

      for (const table of ALL_TABLES) {
        expect(tx[table].deleteMany, `${table} was never erased`).toHaveBeenCalled();
      }
      // Nothing outside the list is touched.
      expect([...order].sort()).toEqual([...ALL_TABLES].sort());
      expect(prismaMock.$transaction).toHaveBeenCalledOnce();
    });

    it('scopes every delete to the subject (no cross-subject deletes)', async () => {
      await deleteViaRoute();

      const direct: Record<string, unknown> = {
        emergencyContact: { user_id: MOCK_USER_ID },
        engagementProfile: { user_id: MOCK_USER_ID },
        clinicalConfig: { user_id: MOCK_USER_ID },
        safetyState: { user_id: MOCK_USER_ID },
        moodLog: { user_id: MOCK_USER_ID },
        journalEntry: { user_id: MOCK_USER_ID },
        userMemory: { user_id: MOCK_USER_ID },
        userToolPreference: { user_id: MOCK_USER_ID },
        therapistNote: { client_user_id: MOCK_USER_ID },
        homework: { client_user_id: MOCK_USER_ID },
        appointment: { client_user_id: MOCK_USER_ID },
        clinicalAccessLog: { client_user_id: MOCK_USER_ID },
        therapistClient: { client_user_id: MOCK_USER_ID },
        inviteToken: { client_user_id: MOCK_USER_ID },
        sessionLog: { user_id: MOCK_USER_ID },
      };

      for (const [table, where] of Object.entries(direct)) {
        expect(tx[table].deleteMany, table).toHaveBeenCalledWith({ where });
      }

      // The four that are keyed indirectly.
      expect(tx.reminder.deleteMany).toHaveBeenCalledWith({
        where: {
          OR: [{ user_id: MOCK_USER_ID }, { homework: { client_user_id: MOCK_USER_ID } }],
        },
      });
      expect(tx.turn.deleteMany).toHaveBeenCalledWith({
        where: {
          OR: [{ user_id: MOCK_USER_ID }, { session_id: { in: [MOCK_SESSION_ID] } }],
        },
      });
      expect(tx.sessionSummary.deleteMany).toHaveBeenCalledWith({
        where: {
          OR: [{ user_id: MOCK_USER_ID }, { session_id: { in: [MOCK_SESSION_ID] } }],
        },
      });
      expect(tx.governanceLog.deleteMany).toHaveBeenCalledWith({
        where: { session_id: { in: [MOCK_SESSION_ID] } },
      });
      expect(tx.betaConsent.deleteMany).toHaveBeenCalledWith({
        where: { user_ref: { in: [MOCK_USER_ID, MOCK_EMAIL, MOCK_AUTH_SUBJECT] } },
      });
      expect(tx.waitlistEntry.deleteMany).toHaveBeenCalledWith({
        where: { OR: [{ email: MOCK_EMAIL }, { phone_number: MOCK_PHONE }] },
      });
    });

    it('never matches NULL identifiers on the loosely-typed tables', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: MOCK_USER_ID,
        deleted_at: null,
        email: null,
        phone_number: null,
        auth_subject: MOCK_AUTH_SUBJECT,
      });

      await deleteViaRoute();

      // Without an email/phone there is nothing to match on: a
      // `phone_number: null` filter would wipe every waitlisted person's row.
      expect(tx.waitlistEntry.deleteMany).not.toHaveBeenCalled();
      expect(tx.betaConsent.deleteMany).toHaveBeenCalledWith({
        where: { user_ref: { in: [MOCK_USER_ID, MOCK_AUTH_SUBJECT] } },
      });
    });

    it('deletes children before their parents', async () => {
      await deleteViaRoute();

      const before = (a: string, b: string) =>
        expect(order.indexOf(a), `${a} must be erased before ${b}`).toBeLessThan(
          order.indexOf(b),
        );

      before('reminder', 'homework');
      before('homework', 'sessionLog');
      before('turn', 'sessionLog');
      before('sessionSummary', 'sessionLog');
      before('governanceLog', 'sessionLog');
      // Every table is erased exactly once, and the tombstone is written last.
      expect(order.length).toBe(ALL_TABLES.length);
      expect(tx.user.update).toHaveBeenCalledOnce();
    });

    it('retains a tombstone with no email and no full name', async () => {
      await deleteViaRoute();

      const update = tx.user.update.mock.calls[0][0] as {
        where: { id: string };
        data: Record<string, unknown>;
      };

      expect(update.where).toEqual({ id: MOCK_USER_ID });
      expect(update.data.email).toBeNull();
      expect(update.data.full_name).toBeNull();
      expect(update.data.phone_number).toBe('');
      expect(update.data.date_of_birth).toBeNull();
      expect(update.data.gender).toBeNull();
      expect(update.data.auth_subject).toMatch(/^deleted-/);
      expect(update.data.deleted_at).toBeInstanceOf(Date);

      // Whatever the key is called, no tombstone field may carry the subject's
      // email, name or original auth subject.
      const serialised = JSON.stringify(update.data);
      expect(serialised).not.toContain(MOCK_EMAIL);
      expect(serialised).not.toContain(MOCK_AUTH_SUBJECT);
    });
  });

  describe('negative — invalid confirmation flag', () => {
    it('returns 400 when confirm is false', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/account/delete',
        payload: { confirm: false },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('CONFIRMATION_REQUIRED');
    });

    it('returns 400 when confirm is missing', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/account/delete',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('CONFIRMATION_REQUIRED');
    });

    it('does NOT call transaction when confirm is false', async () => {
      await app.inject({ method: 'POST', url: '/account/delete', payload: { confirm: false } });
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('negative — user not found', () => {
    beforeEach(() => {
      prismaMock.user.findUnique.mockResolvedValue(null);
    });

    it('returns 401 when auth_subject has no User row', async () => {
      const response = await deleteViaRoute();
      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe('UNAUTHORIZED');
    });

    it('does NOT call transaction when user not found', async () => {
      await deleteViaRoute();
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('edge — already deleted', () => {
    beforeEach(() => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: MOCK_USER_ID,
        deleted_at: new Date('2026-01-01'),
        email: null,
        phone_number: '',
        auth_subject: 'deleted-x',
      });
    });

    it('returns 409 with ALREADY_DELETED', async () => {
      const response = await deleteViaRoute();
      expect(response.statusCode).toBe(409);
      expect(response.json().error.code).toBe('ALREADY_DELETED');
    });

    it('does NOT call transaction', async () => {
      await deleteViaRoute();
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('edge — active session exists', () => {
    beforeEach(() => {
      prismaMock.sessionLog.findFirst.mockResolvedValue({ id: 'active-session-id' });
    });

    it('returns 409 with ACTIVE_SESSION', async () => {
      const response = await deleteViaRoute();
      expect(response.statusCode).toBe(409);
      expect(response.json().error.code).toBe('ACTIVE_SESSION');
      expect(response.json().error.message).toContain('active session');
    });

    it('does NOT call transaction', async () => {
      await deleteViaRoute();
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('auth — bypass disabled', () => {
    beforeEach(() => {
      delete process.env.LOCAL_DEV_BYPASS_AUTH;
      app = buildApp();
    });

    it('returns 401 when no Authorization header', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/account/delete',
        payload: validPayload(),
      });

      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe('UNAUTHORIZED');
    });

    it('returns 401 for invalid token', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/account/delete',
        headers: { authorization: 'Bearer invalid-token' },
        payload: validPayload(),
      });

      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe('UNAUTHORIZED');
    });
  });
});

/**
 * The erasure list is only as good as its agreement with the schema: a new
 * `user_id`/`client_user_id` column added later must not be able to slip past
 * it the way nine tables did before E16-S10. These read the real
 * schema.prisma, so they fail on the commit that introduces the relation.
 */
describe('erasure coverage vs packages/prisma/schema.prisma', () => {
  const schemaPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../../../packages/prisma/schema.prisma',
  );
  const schema = readFileSync(schemaPath, 'utf8');

  /** `model X { ... }` blocks, in schema order. */
  const models = [...schema.matchAll(/^model (\w+) \{\n([\s\S]*?)^\}/gm)].map((m) => ({
    name: m[1],
    body: m[2],
  }));

  const modelsWithUserFk = models
    .filter((m) => /\bUser\s+@relation\(/.test(m.body))
    .map((m) => m.name);

  const delegateFor = (model: string) => model[0].toLowerCase() + model.slice(1);

  it('finds the schema and the known set of subject tables', () => {
    expect(models.length).toBeGreaterThan(30);
    expect(modelsWithUserFk.length).toBe(18);
  });

  it('every relation to User declares onDelete: Cascade', () => {
    const offenders: string[] = [];
    for (const model of models) {
      for (const line of model.body.split('\n')) {
        if (!/\bUser\s+@relation\(/.test(line)) continue;
        if (!/onDelete:\s*Cascade/.test(line)) offenders.push(`${model.name}: ${line.trim()}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('every model with a FK to User is erased by deleteAccount', () => {
    const missing = modelsWithUserFk
      .map(delegateFor)
      .filter((delegate) => !(SUBJECT_TABLES as readonly string[]).includes(delegate));
    expect(missing).toEqual([]);
  });

  it('the test list and the implementation list agree', () => {
    const declared = new Set<string>([...USER_FK_TABLES, ...STRING_REF_TABLES]);
    expect([...SUBJECT_TABLES].filter((t) => !declared.has(t))).toEqual([]);
    expect([...declared].filter((t) => !(SUBJECT_TABLES as readonly string[]).includes(t))).toEqual(
      [],
    );
  });
});
