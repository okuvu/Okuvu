import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { PrismaClient } from '@okuvu/prisma';
import { appRouter } from '../routers/_app';

/**
 * Working goals, worked one at a time.
 *
 * The behaviour that matters to the owner's ask ("target them one by one") is
 * the order: the list is read by position, the focus is the first ACTIVE goal,
 * adding appends, and moving renumbers so two rows can never tie — which they
 * would, because every goal written before the order column existed carries
 * position 0.
 *
 * `LOCAL_DEV_BYPASS_AUTH` skips the roster lookup, exactly as the homework
 * tests do. The ownership cases below still pass a list that belongs to the
 * caller, so a "not found" result is the real one and not a bypass artefact.
 */

const ORIGINAL_BYPASS = process.env.LOCAL_DEV_BYPASS_AUTH;

interface FakeGoal {
  id: string;
  text?: string;
  status?: string;
  position?: number;
}

function buildPrisma(overrides: { goals?: FakeGoal[]; maxPosition?: number | null } = {}) {
  const goals = overrides.goals ?? [];

  return {
    therapist: { findUnique: vi.fn().mockResolvedValue(null) },
    therapistClient: { findUnique: vi.fn().mockResolvedValue(null) },
    clientGoal: {
      findMany: vi.fn().mockResolvedValue(
        goals.map((goal) => ({
          text: goal.text ?? `goal ${goal.id}`,
          status: goal.status ?? 'active',
          position: goal.position ?? 0,
          created_at: new Date('2026-11-01T00:00:00Z'),
          ...goal,
        })),
      ),
      aggregate: vi.fn().mockResolvedValue({
        _max: { position: overrides.maxPosition === undefined ? null : overrides.maxPosition },
      }),
      create: vi.fn().mockResolvedValue({ id: 'goal_new', text: 'a goal', status: 'active', position: 2 }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: vi.fn().mockImplementation(async (ops: unknown[]) => ops),
  } as unknown as PrismaClient;
}

function callerWith(prisma: PrismaClient) {
  return appRouter.createCaller({
    session: { user: { id: 'therapist-1', email: 't@okuvu.dev', name: 'Test Therapist' } },
    prisma,
    headers: new Headers(),
  });
}

beforeEach(() => {
  process.env.LOCAL_DEV_BYPASS_AUTH = 'true';
});

afterEach(() => {
  process.env.LOCAL_DEV_BYPASS_AUTH = ORIGINAL_BYPASS;
  vi.clearAllMocks();
});

describe('goals.list — one at a time', () => {
  it('reads the goals in position order', async () => {
    const prisma = buildPrisma();

    await callerWith(prisma).goals.list({ clientId: 'client_1' });

    expect(prisma.clientGoal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ position: 'asc' }, { created_at: 'asc' }],
        where: { therapist_id: expect.any(String), client_user_id: 'client_1' },
      }),
    );
  });

  it('names the first active goal as the focus, not the first goal', async () => {
    const prisma = buildPrisma({
      goals: [
        { id: 'g1', status: 'achieved', position: 0 },
        { id: 'g2', status: 'dropped', position: 1 },
        { id: 'g3', status: 'active', position: 2 },
        { id: 'g4', status: 'active', position: 3 },
      ],
    });

    const result = await callerWith(prisma).goals.list({ clientId: 'client_1' });

    expect(result.focusGoalId).toBe('g3');
    expect(result.activeCount).toBe(2);
    expect(result.goals).toHaveLength(4);
  });

  it('has no focus when every goal is closed', async () => {
    const prisma = buildPrisma({
      goals: [
        { id: 'g1', status: 'achieved' },
        { id: 'g2', status: 'dropped' },
      ],
    });

    const result = await callerWith(prisma).goals.list({ clientId: 'client_1' });

    expect(result.focusGoalId).toBeNull();
    expect(result.activeCount).toBe(0);
  });
});

describe('goals.add — appends to the queue', () => {
  it('puts a new goal after the last one', async () => {
    const prisma = buildPrisma({ maxPosition: 3 });

    await callerWith(prisma).goals.add({ clientUserId: 'client_1', text: 'walk after dinner' });

    expect(prisma.clientGoal.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ position: 4, text: 'walk after dinner' }),
      }),
    );
  });

  it('starts the first goal at position 0', async () => {
    const prisma = buildPrisma({ maxPosition: null });

    await callerWith(prisma).goals.add({ clientUserId: 'client_1', text: 'first goal' });

    expect(prisma.clientGoal.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ position: 0 }) }),
    );
  });
});

describe('goals.move — the order is what "one at a time" means', () => {
  it('renumbers the whole list when a goal is promoted to the top', async () => {
    const prisma = buildPrisma({
      goals: [
        { id: 'g1', position: 0 },
        { id: 'g2', position: 1 },
        { id: 'g3', position: 2 },
      ],
    });

    const result = await callerWith(prisma).goals.move({
      goalId: 'g3',
      clientId: 'client_1',
      direction: 'top',
    });

    expect(result).toEqual({ moved: true, position: 0 });

    // g3 first, then g1, g2 — each written with its new index.
    const writes = (prisma.clientGoal.updateMany as unknown as { mock: { calls: unknown[][] } }).mock.calls
      .map(([arg]) => arg as { where: { id: string }; data: { position: number } });
    expect(writes.map((call) => [call.where.id, call.data.position])).toEqual([
      ['g3', 0],
      ['g1', 1],
      ['g2', 2],
    ]);
  });

  it('does not write when a goal is already at the top', async () => {
    const prisma = buildPrisma({
      goals: [
        { id: 'g1', position: 0 },
        { id: 'g2', position: 1 },
      ],
    });

    const result = await callerWith(prisma).goals.move({
      goalId: 'g1',
      clientId: 'client_1',
      direction: 'up',
    });

    expect(result).toEqual({ moved: false, position: 0 });
    expect(prisma.clientGoal.updateMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuses a goal that is not on this client\'s list', async () => {
    const prisma = buildPrisma({ goals: [{ id: 'g1', position: 0 }] });

    await expect(
      callerWith(prisma).goals.move({ goalId: 'someone-elses-goal', clientId: 'client_1', direction: 'top' }),
    ).rejects.toThrow(/goal not found/i);

    expect(prisma.clientGoal.updateMany).not.toHaveBeenCalled();
  });
});
