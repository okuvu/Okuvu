import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { PrismaClient } from '@okuvu/prisma';
import { appRouter } from '../routers/_app';

/**
 * The beta admin console's read-only views.
 *
 * These assert the two things a dashboard can quietly get wrong: whose data it
 * is allowed to return (a non-admin gets FORBIDDEN on every one of these), and
 * whether the numbers it prints are derived from the rows or invented. The
 * payments view is asserted to be explicitly disabled rather than showing a
 * zero that reads as revenue.
 */

const ADMIN = { id: 'admin_1', email: 'admin@okuvu.in', name: 'Admin' };
const THERAPIST = { id: 'th_1', email: 'therapist@okuvu.dev', name: 'Dr. Therapist' };
const ORIGINAL_ADMIN_EMAILS = process.env.ADMIN_EMAILS;

type Overrides = Partial<Record<string, unknown>>;

function buildPrisma(overrides: Overrides = {}) {
  return {
    therapist: { count: vi.fn().mockResolvedValue(4) },
    user: {
      count: vi.fn().mockResolvedValue(11),
      findMany: vi.fn().mockResolvedValue([]),
    },
    therapistClient: {
      count: vi.fn().mockResolvedValue(7),
      findMany: vi.fn().mockResolvedValue([]),
    },
    appointment: {
      count: vi.fn().mockResolvedValue(3),
      groupBy: vi.fn().mockResolvedValue([]),
    },
    moodLog: {
      count: vi.fn().mockResolvedValue(21),
      groupBy: vi.fn().mockResolvedValue([]),
    },
    sessionLog: {
      count: vi.fn().mockResolvedValue(9),
      findFirst: vi.fn().mockResolvedValue(null),
      groupBy: vi.fn().mockResolvedValue([]),
    },
    turn: { groupBy: vi.fn().mockResolvedValue([]) },
    waitlistEntry: {
      count: vi.fn().mockResolvedValue(2),
      findMany: vi.fn().mockResolvedValue([]),
    },
    ...overrides,
  } as unknown as PrismaClient;
}

function caller(prisma: PrismaClient, asAdmin = true) {
  const identity = asAdmin ? ADMIN : THERAPIST;
  return appRouter.createCaller({
    session: { user: { id: identity.id, email: identity.email, name: identity.name } },
    prisma,
    headers: new Headers(),
  });
}

beforeEach(() => {
  process.env.ADMIN_EMAILS = 'admin@okuvu.in';
});

afterEach(() => {
  if (ORIGINAL_ADMIN_EMAILS === undefined) delete process.env.ADMIN_EMAILS;
  else process.env.ADMIN_EMAILS = ORIGINAL_ADMIN_EMAILS;
});

describe('admin console — access', () => {
  it('refuses every console procedure to a signed-in non-admin', async () => {
    const api = caller(buildPrisma(), false);

    for (const call of [
      () => api.admin.overview(),
      () => api.admin.listClients(),
      () => api.admin.listAssignments(),
      () => api.admin.listProgress(),
      () => api.admin.paymentsStatus(),
      () => api.admin.listWaitlist(),
    ]) {
      await expect(call()).rejects.toThrow(/Admin access required/);
    }
  });

  it('refuses an anonymous caller outright', async () => {
    const api = appRouter.createCaller({
      session: null,
      prisma: buildPrisma(),
      headers: new Headers(),
    });
    await expect(api.admin.overview()).rejects.toThrow(/UNAUTHORIZED|Unauthorized/);
  });
});

describe('overview', () => {
  it('returns the counts the queries produced, with no derived arithmetic', async () => {
    const result = await caller(buildPrisma()).admin.overview();

    expect(result).toMatchObject({
      therapistCount: 4,
      clientCount: 11,
      activeAssignments: 7,
      pendingAssignments: 7,
      moodCheckinsWeek: 21,
      conversationsWeek: 9,
      crisisFlaggedWeek: 9,
      waitlistCount: 2,
    });
    expect(result.lastConversationAt).toBeNull();
    expect(new Date(result.generatedAt).toString()).not.toBe('Invalid Date');
  });

  it('reports the most recent conversation timestamp when there is one', async () => {
    const when = new Date('2026-10-29T08:30:00.000Z');
    const prisma = buildPrisma({
      sessionLog: {
        count: vi.fn().mockResolvedValue(1),
        findFirst: vi.fn().mockResolvedValue({ session_started_at: when }),
        groupBy: vi.fn().mockResolvedValue([]),
      },
    });

    const result = await caller(prisma).admin.overview();
    expect(result.lastConversationAt).toBe(when.toISOString());
  });
});

describe('listClients', () => {
  const now = new Date('2026-10-30T00:00:00.000Z');

  it('masks the phone number and derives a single therapy state per client', async () => {
    const prisma = buildPrisma({
      user: {
        count: vi.fn(),
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'c_active',
            full_name: 'Asha',
            email: 'asha@example.com',
            phone_number: '+919876543210',
            created_at: now,
            language_mode: 'english',
            clinical_config: { care_plan_id: 'CP2', assignment_state: 'confirmed' },
            assigned_therapists: [
              {
                activated_at: now,
                ended_at: null,
                chat_access_granted: true,
                therapist: { id: 'th_1', name: 'Dr. Therapist', email: 'therapist@okuvu.dev' },
              },
            ],
          },
          {
            id: 'c_invited',
            full_name: 'Ravi',
            email: null,
            phone_number: '+919000000001',
            created_at: now,
            language_mode: 'english',
            clinical_config: null,
            assigned_therapists: [
              {
                activated_at: null,
                ended_at: null,
                chat_access_granted: false,
                therapist: { id: 'th_1', name: null, email: 'therapist@okuvu.dev' },
              },
            ],
          },
          {
            id: 'c_ended',
            full_name: 'Meera',
            email: 'meera@example.com',
            phone_number: '+919000000002',
            created_at: now,
            language_mode: 'english',
            clinical_config: null,
            assigned_therapists: [
              {
                activated_at: now,
                ended_at: now,
                chat_access_granted: false,
                therapist: { id: 'th_2', name: 'Dr. Two', email: 'two@okuvu.dev' },
              },
            ],
          },
        ]),
      },
    });

    const rows = await caller(prisma).admin.listClients();
    const byId = Object.fromEntries(rows.map((row) => [row.id, row]));

    expect(byId.c_active.phoneMasked).toBe('••• ••• 3210');
    expect(byId.c_active.phoneMasked).not.toContain('98765');
    expect(byId.c_active.therapyState).toBe('active');
    expect(byId.c_active.carePlan).toBe('CP2');
    expect(byId.c_active.therapists).toHaveLength(1);
    expect(byId.c_active.therapists[0].chatAccess).toBe(true);

    // Invited: an assignment exists but the client has never activated.
    expect(byId.c_invited.therapyState).toBe('invited');
    // Ended assignments do not count as "held by" anybody.
    expect(byId.c_ended.therapyState).toBe('unassigned');
    expect(byId.c_ended.therapists).toHaveLength(0);
  });

  it('passes the search term through as a case-insensitive filter', async () => {
    const prisma = buildPrisma();
    await caller(prisma).admin.listClients({ search: '  asha ' });

    const args = (prisma.user.findMany as unknown as { mock: { calls: [unknown][] } }).mock.calls[0][0] as {
      where: { OR?: { full_name?: { contains: string; mode: string } }[] };
    };
    expect(args.where.OR?.[0]?.full_name).toEqual({ contains: 'asha', mode: 'insensitive' });
  });

  it('does not filter when the search box is empty', async () => {
    const prisma = buildPrisma();
    await caller(prisma).admin.listClients({ search: '   ' });

    const args = (prisma.user.findMany as unknown as { mock: { calls: [unknown][] } }).mock.calls[0][0] as {
      where: { OR?: unknown };
    };
    expect(args.where.OR).toBeUndefined();
  });
});

describe('listAssignments', () => {
  it('labels each pairing with its state, including ended ones', async () => {
    const when = new Date('2026-10-01T00:00:00.000Z');
    const prisma = buildPrisma({
      therapistClient: {
        count: vi.fn(),
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'a1',
            created_at: when,
            activated_at: when,
            ended_at: null,
            chat_access_granted: false,
            therapist: { id: 'th_1', name: 'Dr. Therapist', email: 'therapist@okuvu.dev' },
            client: { id: 'c1', full_name: 'Asha', email: 'asha@example.com', phone_number: '+919876543210' },
          },
          {
            id: 'a2',
            created_at: when,
            activated_at: null,
            ended_at: null,
            chat_access_granted: false,
            therapist: { id: 'th_1', name: null, email: 'therapist@okuvu.dev' },
            client: { id: 'c2', full_name: null, email: null, phone_number: '+919000000001' },
          },
          {
            id: 'a3',
            created_at: when,
            activated_at: when,
            ended_at: when,
            chat_access_granted: true,
            therapist: { id: 'th_2', name: 'Dr. Two', email: 'two@okuvu.dev' },
            client: { id: 'c3', full_name: 'Meera', email: 'meera@example.com', phone_number: '+919000000002' },
          },
        ]),
      },
    });

    const rows = await caller(prisma).admin.listAssignments();
    expect(rows.map((row) => row.state)).toEqual(['active', 'invited', 'ended']);
    // A therapist with no name falls back to their email; a client with no
    // name falls back to the masked phone, never the raw number.
    expect(rows[1].therapistLabel).toBe('therapist@okuvu.dev');
    expect(rows[1].clientLabel).toBe('••• ••• 0001');
  });
});

describe('listProgress', () => {
  it('aggregates per client without ever selecting message content', async () => {
    const lastTurn = new Date('2026-10-28T10:00:00.000Z');
    const lastSession = new Date('2026-10-29T10:00:00.000Z');

    const prisma = buildPrisma({
      user: {
        count: vi.fn(),
        findMany: vi.fn().mockResolvedValue([
          { id: 'c1', full_name: 'Asha', email: 'asha@example.com', phone_number: '+919876543210' },
          { id: 'c2', full_name: null, email: null, phone_number: '+919000000009' },
        ]),
      },
      turn: {
        groupBy: vi.fn().mockImplementation((args: { where?: unknown }) =>
          Promise.resolve(
            args.where
              ? [{ user_id: 'c1', _count: { _all: 6 } }]
              : [{ user_id: 'c1', _count: { _all: 40 }, _max: { created_at: lastTurn } }],
          ),
        ),
      },
      moodLog: {
        count: vi.fn(),
        groupBy: vi.fn().mockResolvedValue([
          { user_id: 'c1', _count: { _all: 12 }, _max: { date_ist: lastSession } },
        ]),
      },
      sessionLog: {
        count: vi.fn(),
        findFirst: vi.fn(),
        groupBy: vi.fn().mockResolvedValue([
          { user_id: 'c1', _count: { _all: 5 }, _max: { session_started_at: lastSession } },
        ]),
      },
      appointment: {
        count: vi.fn(),
        groupBy: vi.fn().mockResolvedValue([{ client_user_id: 'c1', _count: { _all: 3 } }]),
      },
    });

    const rows = await caller(prisma).admin.listProgress();
    const asha = rows.find((row) => row.id === 'c1')!;
    const quiet = rows.find((row) => row.id === 'c2')!;

    expect(asha).toMatchObject({
      totalTurns: 40,
      turnsThisWeek: 6,
      conversations: 5,
      moodCheckins: 12,
      appointments: 3,
    });
    expect(asha.lastActivityAt).toBe(lastSession.toISOString());
    expect(quiet).toMatchObject({ totalTurns: 0, turnsThisWeek: 0, appointments: 0 });
    expect(quiet.lastActivityAt).toBeNull();
    expect(quiet.phoneMasked).toBe('••• ••• 0009');

    // The only fields selected from User are identity + phone. If someone adds
    // conversation content to this view, this assertion is the tripwire.
    const args = (prisma.user.findMany as unknown as { mock: { calls: [unknown][] } }).mock.calls[0][0] as {
      select: Record<string, unknown>;
    };
    expect(Object.keys(args.select).sort()).toEqual(['email', 'full_name', 'id', 'phone_number']);
  });
});

describe('paymentsStatus', () => {
  it('says payments are not enabled and never reports an amount', async () => {
    const result = await caller(buildPrisma()).admin.paymentsStatus();

    expect(result.enabled).toBe(false);
    expect(result.payIn).toBeNull();
    expect(result.payOut).toBeNull();
    expect(result.heldAppointments).toBe(3);
    expect(result.reason).toMatch(/not implemented/i);
  });
});

describe('listWaitlist', () => {
  it('returns the addresses people asked to be contacted on', async () => {
    const when = new Date('2026-10-30T06:00:00.000Z');
    const prisma = buildPrisma({
      waitlistEntry: {
        count: vi.fn(),
        findMany: vi.fn().mockResolvedValue([
          { id: 'w1', email: 'person@example.com', phone_number: null, created_at: when },
        ]),
      },
    });

    const rows = await caller(prisma).admin.listWaitlist();
    expect(rows).toEqual([
      { id: 'w1', email: 'person@example.com', phone: null, createdAt: when.toISOString() },
    ]);
  });
});
