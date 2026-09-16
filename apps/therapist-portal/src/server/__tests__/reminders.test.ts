import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { PrismaClient } from '@okuvu/prisma';
import { appRouter } from '../routers/_app';

const ORIGINAL_BYPASS = process.env.LOCAL_DEV_BYPASS_AUTH;

function buildPrisma(overrides: {
  homeworkOwner?: string | null;
  toolExists?: boolean;
} = {}) {
  return {
    therapist: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    therapistClient: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    homework: {
      findUnique: vi.fn().mockResolvedValue(
        overrides.homeworkOwner === undefined
          ? { client_user_id: 'client_1' }
          : overrides.homeworkOwner === null
            ? null
            : { client_user_id: overrides.homeworkOwner },
      ),
    },
    toolRegistryEntry: {
      findUnique: vi.fn().mockResolvedValue(
        overrides.toolExists === false ? null : { tool_id: 'box_breathing' },
      ),
    },
    reminder: {
      create: vi.fn().mockResolvedValue({
        id: 'rem_1',
        active: true,
        created_at: new Date('2026-09-16T00:00:00.000Z'),
      }),
    },
  } as unknown as PrismaClient;
}

function callerWith(prisma: PrismaClient) {
  return appRouter.createCaller({
    session: { user: { id: 'irrelevant-in-bypass', email: 'irrelevant@okuvu.dev', name: 'Test Therapist' } },
    prisma,
    headers: new Headers(),
  });
}

// Security-audit round, 16 Sep 2026 — reminders.create previously accepted
// a homeworkId/toolId with no check that the homework actually belongs to
// the same client the reminder is for, unlike every other ID-based
// mutation in this codebase (markCompleted, setActive, reschedule all
// re-verify ownership). This let a therapist cross-link a reminder to
// another client's homework row just by knowing/guessing its id.
describe('reminders.create — homeworkId/toolId validation', () => {
  beforeEach(() => {
    process.env.LOCAL_DEV_BYPASS_AUTH = 'true';
  });

  afterEach(() => {
    process.env.LOCAL_DEV_BYPASS_AUTH = ORIGINAL_BYPASS;
    vi.clearAllMocks();
  });

  const baseInput = {
    clientUserId: 'client_1',
    scheduleNote: 'Practice before bed.',
    frequency: 'once_daily' as const,
    times: ['21:00'],
  };

  it('creates a reminder with no homeworkId/toolId (plain reminder)', async () => {
    const prisma = buildPrisma();
    const caller = callerWith(prisma);

    const result = await caller.reminders.create(baseInput);

    expect(result.id).toBe('rem_1');
    expect(prisma.reminder.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ homework_id: null, tool_id: null }),
      }),
    );
  });

  it('creates a reminder when homeworkId belongs to the same client', async () => {
    const prisma = buildPrisma({ homeworkOwner: 'client_1' });
    const caller = callerWith(prisma);

    await caller.reminders.create({ ...baseInput, homeworkId: 'hw_1' });

    expect(prisma.reminder.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ homework_id: 'hw_1' }),
      }),
    );
  });

  it('rejects a homeworkId that belongs to a different client', async () => {
    const prisma = buildPrisma({ homeworkOwner: 'someone_else' });
    const caller = callerWith(prisma);

    await expect(
      caller.reminders.create({ ...baseInput, homeworkId: 'hw_1' }),
    ).rejects.toThrow(/homework not found/i);

    expect(prisma.reminder.create).not.toHaveBeenCalled();
  });

  it('rejects a homeworkId that does not exist at all', async () => {
    const prisma = buildPrisma({ homeworkOwner: null });
    const caller = callerWith(prisma);

    await expect(
      caller.reminders.create({ ...baseInput, homeworkId: 'hw_nonexistent' }),
    ).rejects.toThrow(/homework not found/i);

    expect(prisma.reminder.create).not.toHaveBeenCalled();
  });

  it('rejects a toolId that does not exist in the tool registry', async () => {
    const prisma = buildPrisma({ toolExists: false });
    const caller = callerWith(prisma);

    await expect(
      caller.reminders.create({ ...baseInput, toolId: 'not_a_real_tool' }),
    ).rejects.toThrow(/tool not found/i);

    expect(prisma.reminder.create).not.toHaveBeenCalled();
  });

  it('rejects a scheduleNote exceeding the max length', async () => {
    const prisma = buildPrisma();
    const caller = callerWith(prisma);

    await expect(
      caller.reminders.create({ ...baseInput, scheduleNote: 'x'.repeat(2001) }),
    ).rejects.toThrow();

    expect(prisma.reminder.create).not.toHaveBeenCalled();
  });
});
