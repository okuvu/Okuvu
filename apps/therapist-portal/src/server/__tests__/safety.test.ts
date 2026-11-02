import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { PrismaClient } from '@okuvu/prisma';
import { appRouter } from '../routers/_app';

/**
 * Portal P0 — the Safety card and the Dashboard banner.
 *
 * These are the router-level half of "the Safety column, banner and card work
 * end-to-end against real S3/S4 events": a real flag row (shape below is the
 * prisma row a real insert produces) is rendered through the real procedures.
 * The other half is the live run on dev RDS described in the PR.
 */

const THERAPIST = { id: 'th_1', email: 'therapist@okuvu.dev', name: 'Therapist One' };
const CLIENT_ID = 'client_1';
const OTHER_CLIENT_ID = 'client_2';

function flagRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'flag_1',
    user_id: CLIENT_ID,
    level: 'S4' as const,
    occurred_at: new Date('2026-11-02T09:15:00Z'),
    crisis_screen_shown: true,
    source: 'crisis_card',
    acknowledged_at: null,
    ...overrides,
  };
}

interface Overrides {
  assignments?: unknown;
  flags?: unknown[];
  flag?: unknown;
}

function buildPrisma(overrides: Overrides = {}) {
  return {
    therapist: { findUnique: vi.fn().mockResolvedValue(THERAPIST) },
    therapistClient: {
      findUnique: vi.fn().mockResolvedValue({ id: 'tc_1' }),
      findMany: vi
        .fn()
        .mockResolvedValue(
          overrides.assignments ?? [{ client_user_id: CLIENT_ID }, { client_user_id: OTHER_CLIENT_ID }],
        ),
    },
    safetyFlag: {
      findMany: vi.fn().mockResolvedValue(overrides.flags ?? []),
      groupBy: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(overrides.flag ?? null),
      update: vi.fn().mockResolvedValue({}),
    },
    clinicalAccessLog: { create: vi.fn().mockResolvedValue({}) },
  } as unknown as PrismaClient;
}

function callerWith(prisma: PrismaClient) {
  return appRouter.createCaller({
    session: { user: { id: THERAPIST.id, email: THERAPIST.email, name: THERAPIST.name } },
    prisma,
    headers: new Headers(),
  });
}

const ORIGINAL_BYPASS = process.env.LOCAL_DEV_BYPASS_AUTH;

beforeEach(() => {
  // The bypass short-circuits assertClientAssigned and logClinicalAccess,
  // which would make the authorisation and audit assertions vacuous.
  delete process.env.LOCAL_DEV_BYPASS_AUTH;
});

afterEach(() => {
  if (ORIGINAL_BYPASS === undefined) delete process.env.LOCAL_DEV_BYPASS_AUTH;
  else process.env.LOCAL_DEV_BYPASS_AUTH = ORIGINAL_BYPASS;
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('safety.flagsForClient', () => {
  it('returns the history newest-first, with the level and the screen shown', async () => {
    const prisma = buildPrisma({
      flags: [
        flagRow({ id: 'flag_2', level: 'S3', occurred_at: new Date('2026-11-02T11:00:00Z'), source: 's3_grounding' }),
        flagRow({ id: 'flag_1', level: 'S4', occurred_at: new Date('2026-10-30T09:15:00Z') }),
      ],
    });
    const caller = callerWith(prisma);

    const result = await caller.safety.flagsForClient({ clientUserId: CLIENT_ID, limit: 20 });

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      id: 'flag_2',
      level: 'S3',
      occurredAt: '2026-11-02T11:00:00.000Z',
      crisisScreenShown: true,
      source: 's3_grounding',
      acknowledgedAt: null,
    });
    // Newest first, as the card renders them.
    expect(prisma.safetyFlag.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { user_id: CLIENT_ID },
        orderBy: { occurred_at: 'desc' },
      }),
    );
  });

  it('refuses a client who is not assigned to this therapist', async () => {
    const prisma = buildPrisma();
    (prisma.therapistClient.findUnique as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const caller = callerWith(prisma);

    await expect(caller.safety.flagsForClient({ clientUserId: CLIENT_ID, limit: 20 })).rejects.toThrow(
      /not assigned/i,
    );
    expect(prisma.safetyFlag.findMany).not.toHaveBeenCalled();
  });

  it('carries no conversation content — a flag row has no field for it', async () => {
    const prisma = buildPrisma({ flags: [flagRow()] });
    const caller = callerWith(prisma);

    const [flag] = await caller.safety.flagsForClient({ clientUserId: CLIENT_ID, limit: 20 });

    expect(Object.keys(flag).sort()).toEqual([
      'acknowledgedAt',
      'crisisScreenShown',
      'id',
      'level',
      'occurredAt',
      'source',
    ]);
  });
});

describe('safety.acknowledge', () => {
  it('records the therapist and the time', async () => {
    const prisma = buildPrisma({ flag: flagRow() });
    const caller = callerWith(prisma);

    const result = await caller.safety.acknowledge({ flagId: 'flag_1' });

    expect(result.success).toBe(true);
    expect(result.alreadyAcknowledged).toBe(false);
    expect(prisma.safetyFlag.update).toHaveBeenCalledWith({
      where: { id: 'flag_1' },
      data: {
        acknowledged_at: expect.any(Date),
        acknowledged_by_therapist_id: THERAPIST.id,
      },
    });
    // An acknowledgement is a clinical access event.
    expect(prisma.clinicalAccessLog.create).toHaveBeenCalledWith({
      data: {
        therapist_id: THERAPIST.id,
        client_user_id: CLIENT_ID,
        action: 'ACKNOWLEDGE_SAFETY_FLAG',
      },
    });
  });

  it('is permanent: a second call returns the first record and rewrites nothing', async () => {
    const acknowledgedAt = new Date('2026-11-02T10:00:00Z');
    const prisma = buildPrisma({ flag: flagRow({ acknowledged_at: acknowledgedAt }) });
    const caller = callerWith(prisma);

    const result = await caller.safety.acknowledge({ flagId: 'flag_1' });

    expect(result.alreadyAcknowledged).toBe(true);
    expect(result.acknowledgedAt).toBe(acknowledgedAt.toISOString());
    expect(prisma.safetyFlag.update).not.toHaveBeenCalled();
  });

  it('refuses a flag belonging to a client of another therapist', async () => {
    const prisma = buildPrisma({ flag: flagRow({ user_id: 'someone_else' }) });
    (prisma.therapistClient.findUnique as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const caller = callerWith(prisma);

    await expect(caller.safety.acknowledge({ flagId: 'flag_1' })).rejects.toThrow(/not assigned/i);
    expect(prisma.safetyFlag.update).not.toHaveBeenCalled();
  });

  it('404s on an unknown flag', async () => {
    const prisma = buildPrisma({ flag: null });
    const caller = callerWith(prisma);

    await expect(caller.safety.acknowledge({ flagId: 'nope' })).rejects.toThrow(/not found/i);
  });
});

describe('safety.rosterSummary', () => {
  it('counts unacknowledged flags and picks each client’s latest event', async () => {
    const latest = new Date('2026-11-02T09:15:00Z');
    const prisma = buildPrisma();
    (prisma.safetyFlag.groupBy as unknown as ReturnType<typeof vi.fn>)
      // first call: latest flag of any acknowledgement state
      .mockResolvedValueOnce([
        { user_id: CLIENT_ID, _max: { occurred_at: latest } },
        { user_id: OTHER_CLIENT_ID, _max: { occurred_at: null } },
      ])
      // second call: unacknowledged counts
      .mockResolvedValueOnce([{ user_id: CLIENT_ID, _count: { _all: 2 }, _max: { occurred_at: latest } }]);
    (prisma.safetyFlag.findMany as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([
      { user_id: CLIENT_ID, level: 'S4', occurred_at: latest, acknowledged_at: null },
    ]);
    const caller = callerWith(prisma);

    const result = await caller.safety.rosterSummary();

    expect(result).toEqual([
      {
        clientUserId: CLIENT_ID,
        unacknowledgedCount: 2,
        latest: { level: 'S4', occurredAt: latest.toISOString(), acknowledgedAt: null },
      },
      { clientUserId: OTHER_CLIENT_ID, unacknowledgedCount: 0, latest: null },
    ]);
  });

  it('returns nothing for a therapist with no clients, without querying flags', async () => {
    const prisma = buildPrisma({ assignments: [] });
    const caller = callerWith(prisma);

    await expect(caller.safety.rosterSummary()).resolves.toEqual([]);
    expect(prisma.safetyFlag.groupBy).not.toHaveBeenCalled();
  });
});
