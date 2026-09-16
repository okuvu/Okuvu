import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { PrismaClient } from '@okuvu/prisma';
import { appRouter } from '../routers/_app';

const ORIGINAL_BYPASS = process.env.LOCAL_DEV_BYPASS_AUTH;

function buildPrisma(overrides: { homeworkRows?: unknown[]; toolExists?: boolean } = {}) {
  return {
    // therapistProcedure always looks this up first; returning null falls
    // through to the LOCAL_DEV_BYPASS_AUTH path (trpc.ts lines 53-59).
    therapist: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    therapistClient: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    homework: {
      create: vi.fn().mockResolvedValue({
        id: 'hw_1',
        status: 'active',
        assigned_at: new Date('2026-09-16T00:00:00.000Z'),
      }),
      findMany: vi.fn().mockResolvedValue(overrides.homeworkRows ?? []),
    },
    toolRegistryEntry: {
      findUnique: vi.fn().mockResolvedValue(
        overrides.toolExists === false ? null : { tool_id: 'box_breathing' },
      ),
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

// Decisions doc round, 15 Sep 2026 §4 — Homework.tool_id links an
// assignment to one of the 5 approved exercises. Additive: existing
// pure-text assignments (toolId omitted) keep working unchanged.
describe('homework.assign — tool_id linking', () => {
  beforeEach(() => {
    process.env.LOCAL_DEV_BYPASS_AUTH = 'true';
  });

  afterEach(() => {
    process.env.LOCAL_DEV_BYPASS_AUTH = ORIGINAL_BYPASS;
    vi.clearAllMocks();
  });

  it('writes tool_id when toolId is provided', async () => {
    const prisma = buildPrisma();
    const caller = callerWith(prisma);

    await caller.homework.assign({
      clientUserId: 'client_1',
      description: 'Practice box breathing before bed.',
      toolId: 'box_breathing',
    });

    expect(prisma.homework.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tool_id: 'box_breathing' }),
      }),
    );
  });

  it('writes an undefined tool_id when toolId is omitted (pure free-text assignment)', async () => {
    const prisma = buildPrisma();
    const caller = callerWith(prisma);

    await caller.homework.assign({
      clientUserId: 'client_1',
      description: 'Journal about the week before Thursday.',
    });

    expect(prisma.homework.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tool_id: undefined }),
      }),
    );
  });

  it('rejects an empty description', async () => {
    const prisma = buildPrisma();
    const caller = callerWith(prisma);

    await expect(
      caller.homework.assign({ clientUserId: 'client_1', description: '  ' }),
    ).rejects.toThrow();
  });

  it('rejects a toolId that does not exist in the tool registry', async () => {
    const prisma = buildPrisma({ toolExists: false });
    const caller = callerWith(prisma);

    await expect(
      caller.homework.assign({
        clientUserId: 'client_1',
        description: 'Practice a made-up exercise.',
        toolId: 'not_a_real_tool',
      }),
    ).rejects.toThrow(/tool not found/i);

    expect(prisma.homework.create).not.toHaveBeenCalled();
  });
});

describe('homework.listHomework — tool view shape', () => {
  beforeEach(() => {
    process.env.LOCAL_DEV_BYPASS_AUTH = 'true';
  });

  afterEach(() => {
    process.env.LOCAL_DEV_BYPASS_AUTH = ORIGINAL_BYPASS;
    vi.clearAllMocks();
  });

  it('maps a tool-linked row to { toolId, label }', async () => {
    const prisma = buildPrisma({
      homeworkRows: [
        {
          id: 'hw_1',
          description: 'Practice box breathing before bed.',
          status: 'active',
          assigned_at: new Date('2026-09-16T00:00:00.000Z'),
          updated_at: new Date('2026-09-16T00:00:00.000Z'),
          tool: { tool_id: 'box_breathing', label: 'Box Breathing' },
        },
      ],
    });
    const caller = callerWith(prisma);

    const result = await caller.homework.listHomework({ clientId: 'client_1' });

    expect(result[0].tool).toEqual({ toolId: 'box_breathing', label: 'Box Breathing' });
  });

  it('maps a text-only row (no tool) to tool: null', async () => {
    const prisma = buildPrisma({
      homeworkRows: [
        {
          id: 'hw_2',
          description: 'Journal about the week.',
          status: 'active',
          assigned_at: new Date('2026-09-16T00:00:00.000Z'),
          updated_at: new Date('2026-09-16T00:00:00.000Z'),
          tool: null,
        },
      ],
    });
    const caller = callerWith(prisma);

    const result = await caller.homework.listHomework({ clientId: 'client_1' });

    expect(result[0].tool).toBeNull();
  });
});
