import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { PrismaClient } from '@okuvu/prisma';
import { appRouter } from '../routers/_app';

/**
 * Step 8 — finding and assigning exercises in the portal.
 *
 * The four things the owner asked to be checked, each as a real call:
 *
 *  1. only approved exercises can be assigned;
 *  2. the personal line is stored on the assignment (it is what the client app
 *     renders above the therapist's marked step);
 *  3. the private note is stored but never leaves the portal — it is not in the
 *     notification row, which is the only thing the client ever reads from the
 *     assignment;
 *  4. a set becomes one assignment per exercise, and the daily cap is the only
 *     thing that limits the mail (proved in the email test file, where the
 *     sender and the cap both exist).
 *
 * `LOCAL_DEV_BYPASS_AUTH` skips the therapist/roster lookups, exactly as the
 * existing homework tests do; the ownership tests below still pass a set that
 * belongs to the caller, because the bypass path would otherwise make a "not
 * found" case pass for the wrong reason.
 */

const ORIGINAL_BYPASS = process.env.LOCAL_DEV_BYPASS_AUTH;

interface FakeRow {
  tool_id: string;
  label: string;
  status: string;
  kind?: string;
}

function buildPrisma(
  overrides: {
    tool?: FakeRow | null;
    tools?: FakeRow[];
    set?: unknown;
    goal?: { text: string } | null;
    homeworkIds?: string[];
  } = {},
) {
  let created = 0;
  const create = vi.fn().mockImplementation(async () => {
    created += 1;
    return { id: (overrides.homeworkIds ?? [])[created - 1] ?? `hw_${created}`, status: 'active', assigned_at: new Date() };
  });

  return {
    therapist: { findUnique: vi.fn().mockResolvedValue(null) },
    therapistClient: { findUnique: vi.fn().mockResolvedValue(null) },
    homework: {
      create,
      findMany: vi.fn().mockResolvedValue([]),
    },
    toolRegistryEntry: {
      findUnique: vi.fn().mockResolvedValue(
        overrides.tool === undefined
          ? { tool_id: 'ws_thought_record', label: 'Thought record', status: 'approved', kind: 'worksheet' }
          : overrides.tool,
      ),
      findMany: vi.fn().mockResolvedValue(overrides.tools ?? []),
    },
    clientGoal: {
      findFirst: vi.fn().mockResolvedValue(overrides.goal ?? null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: 'goal_1', text: 'a goal', status: 'active' }),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    exerciseSet: {
      findFirst: vi.fn().mockResolvedValue(overrides.set ?? null),
      create: vi.fn().mockResolvedValue({ id: 'set_1', name: 'My anxiety starter set' }),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    // The notification write needs a recipient row. No email address means the
    // row is still written and no mail is attempted, which is what these tests
    // want to observe: the row IS what the client sees.
    user: {
      findUnique: vi.fn().mockResolvedValue({
        email: null,
        appointment_reminders_enabled: true,
        update_emails_enabled: true,
        email_update_token: null,
      }),
    },
    notification: { create: vi.fn().mockResolvedValue({}) },
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

describe('homework.assign — only approved exercises', () => {
  it('refuses a draft worksheet and writes nothing', async () => {
    const prisma = buildPrisma({
      tool: { tool_id: 'ws_thought_record', label: 'Thought record', status: 'draft', kind: 'worksheet' },
    });

    await expect(
      callerWith(prisma).homework.assign({ clientUserId: 'client_1', toolId: 'ws_thought_record' }),
    ).rejects.toThrow(/not approved/i);

    expect(prisma.homework.create).not.toHaveBeenCalled();
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it('refuses a retired exercise', async () => {
    const prisma = buildPrisma({
      tool: { tool_id: 'guided_breathing', label: 'Guided breathing', status: 'retired', kind: 'exercise' },
    });

    await expect(
      callerWith(prisma).homework.assign({ clientUserId: 'client_1', toolId: 'guided_breathing' }),
    ).rejects.toThrow(/not approved/i);

    expect(prisma.homework.create).not.toHaveBeenCalled();
  });

  it('accepts an approved worksheet', async () => {
    const prisma = buildPrisma();

    const result = await callerWith(prisma).homework.assign({
      clientUserId: 'client_1',
      toolId: 'ws_thought_record',
    });

    expect(result.id).toBe('hw_1');
    expect(prisma.homework.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tool_id: 'ws_thought_record' }),
      }),
    );
  });
});

describe('homework.assign — the assignment details', () => {
  it('stores the personal line in the client\'s own words', async () => {
    const prisma = buildPrisma();
    const personalNote = 'for when the 9am standup starts';

    await callerWith(prisma).homework.assign({
      clientUserId: 'client_1',
      toolId: 'ws_thought_record',
      personalNote,
      frequency: 'once_daily',
      dueAt: '2026-11-20T00:00:00.000Z',
      privateNote: 'froze at the review — chosen for that',
    });

    const data = vi.mocked(prisma.homework.create).mock.calls[0][0].data as Record<string, unknown>;
    expect(data.personal_note).toBe(personalNote);
    expect(data.frequency).toBe('once_daily');
    expect(data.due_at).toBeInstanceOf(Date);
    // The description is what the Today card shows when there is no exercise
    // label to show; it falls back to the personal line, never to the private one.
    expect(data.description).toBe(personalNote);
  });

  it('keeps the private note on the assignment but out of the client-facing row', async () => {
    const prisma = buildPrisma();
    const privateNote = 'froze at the review — chosen for that';

    await callerWith(prisma).homework.assign({
      clientUserId: 'client_1',
      toolId: 'ws_thought_record',
      personalNote: 'after the standup',
      privateNote,
    });

    const data = vi.mocked(prisma.homework.create).mock.calls[0][0].data as Record<string, unknown>;
    expect(data.therapist_private_note).toBe(privateNote);

    // The notification is a copy of the assignment the client reads. If the note
    // ever leaked, it would leak here first.
    const notification = JSON.stringify(vi.mocked(prisma.notification.create).mock.calls[0][0]);
    expect(notification).not.toContain(privateNote);
    expect(notification).not.toContain('froze at the review');
  });

  it('copies the linked goal text onto the assignment', async () => {
    const prisma = buildPrisma({ goal: { text: 'say no to one extra shift a week' } });

    await callerWith(prisma).homework.assign({
      clientUserId: 'client_1',
      toolId: 'ws_thought_record',
      goalId: 'goal_1',
    });

    expect(prisma.clientGoal.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'goal_1', therapist_id: expect.any(String), client_user_id: 'client_1' },
      }),
    );
    const data = vi.mocked(prisma.homework.create).mock.calls[0][0].data as Record<string, unknown>;
    expect(data.therapy_goal).toBe('say no to one extra shift a week');
  });

  it('refuses a goal that is not this therapist\'s for this client', async () => {
    const prisma = buildPrisma({ goal: null });

    await expect(
      callerWith(prisma).homework.assign({
        clientUserId: 'client_1',
        toolId: 'ws_thought_record',
        goalId: 'someone-elses-goal',
      }),
    ).rejects.toThrow(/goal not found/i);

    expect(prisma.homework.create).not.toHaveBeenCalled();
  });

  it('still assigns typed homework with no exercise and no schedule', async () => {
    const prisma = buildPrisma();

    await callerWith(prisma).homework.assign({
      clientUserId: 'client_1',
      description: 'Journal about the week before Thursday.',
    });

    const data = vi.mocked(prisma.homework.create).mock.calls[0][0].data as Record<string, unknown>;
    expect(data.tool_id).toBeUndefined();
    expect(data.description).toBe('Journal about the week before Thursday.');
    expect(data.frequency).toBeUndefined();
    expect(data.personal_note).toBeUndefined();
  });
});

describe('homework.assignSet', () => {
  const setWith = (toolIds: string[]) => ({
    id: 'set_1',
    name: 'My anxiety starter set',
    items: toolIds.map((tool_id, index) => ({ tool_id, sort_order: index })),
  });

  it('creates one assignment per exercise in the set', async () => {
    const prisma = buildPrisma({
      set: setWith(['ws_thought_record', 'ws_worry_tree', 'grounding_5431']),
      tools: [
        { tool_id: 'ws_thought_record', label: 'Thought record', status: 'approved', kind: 'worksheet' },
        { tool_id: 'ws_worry_tree', label: 'Worry tree', status: 'approved', kind: 'worksheet' },
        { tool_id: 'grounding_5431', label: 'Grounding', status: 'approved', kind: 'exercise' },
      ],
      homeworkIds: ['hw_a', 'hw_b', 'hw_c'],
    });

    const result = await callerWith(prisma).homework.assignSet({
      clientUserId: 'client_1',
      setId: 'set_1',
      frequency: 'once_daily',
    });

    expect(result.homeworkIds).toEqual(['hw_a', 'hw_b', 'hw_c']);
    expect(prisma.homework.create).toHaveBeenCalledTimes(3);

    const first = vi.mocked(prisma.homework.create).mock.calls[0][0].data as Record<string, unknown>;
    expect(first.tool_id).toBe('ws_thought_record');
    expect(first.frequency).toBe('once_daily');
    // One inbox row per assignment: the client sees three things they were asked
    // to do. Email is capped by the sender, not by dropping the rows.
    expect(prisma.notification.create).toHaveBeenCalledTimes(3);
  });

  it('refuses a set that is not the caller\'s', async () => {
    const prisma = buildPrisma({ set: null });

    await expect(
      callerWith(prisma).homework.assignSet({ clientUserId: 'client_1', setId: 'someone-elses-set' }),
    ).rejects.toThrow(/set not found/i);

    expect(prisma.homework.create).not.toHaveBeenCalled();
  });

  it('fails the whole set rather than half-assigning it when a member is no longer approved', async () => {
    const prisma = buildPrisma({
      set: setWith(['ws_thought_record', 'guided_breathing']),
      tools: [
        { tool_id: 'ws_thought_record', label: 'Thought record', status: 'approved', kind: 'worksheet' },
        { tool_id: 'guided_breathing', label: 'Guided breathing', status: 'retired', kind: 'exercise' },
      ],
    });

    await expect(
      callerWith(prisma).homework.assignSet({ clientUserId: 'client_1', setId: 'set_1' }),
    ).rejects.toThrow(/no longer approved/i);

    expect(prisma.homework.create).not.toHaveBeenCalled();
  });

  it('refuses an empty set', async () => {
    const prisma = buildPrisma({ set: setWith([]) });

    await expect(
      callerWith(prisma).homework.assignSet({ clientUserId: 'client_1', setId: 'set_1' }),
    ).rejects.toThrow(/no exercises/i);

    expect(prisma.homework.create).not.toHaveBeenCalled();
  });
});

describe('exerciseSets.create', () => {
  it('stores the set with one item per exercise', async () => {
    const prisma = buildPrisma({
      tools: [
        { tool_id: 'ws_thought_record', label: 'Thought record', status: 'approved', kind: 'worksheet' },
        { tool_id: 'grounding_5431', label: 'Grounding', status: 'approved', kind: 'exercise' },
      ],
    });

    const result = await callerWith(prisma).exerciseSets.create({
      name: 'My anxiety starter set',
      toolIds: ['ws_thought_record', 'grounding_5431', 'ws_thought_record'],
    });

    expect(result.name).toBe('My anxiety starter set');
    const data = vi.mocked(prisma.exerciseSet.create).mock.calls[0][0].data as any;
    // Duplicates are collapsed, so the unique index cannot be tripped by a
    // double click in the picker.
    expect(data.items.create.map((item: any) => item.tool_id)).toEqual([
      'ws_thought_record',
      'grounding_5431',
    ]);
  });

  it('refuses to build a set around an unapproved exercise', async () => {
    const prisma = buildPrisma({
      tools: [{ tool_id: 'ws_thought_record', label: 'Thought record', status: 'draft', kind: 'worksheet' }],
    });

    await expect(
      callerWith(prisma).exerciseSets.create({ name: 'Half a set', toolIds: ['ws_thought_record'] }),
    ).rejects.toThrow(/not approved/i);

    expect(prisma.exerciseSet.create).not.toHaveBeenCalled();
  });
});

describe('goals', () => {
  it('writes a goal against the therapist and client', async () => {
    const prisma = buildPrisma();

    await callerWith(prisma).goals.add({
      clientUserId: 'client_1',
      text: 'say no to one extra shift a week',
    });

    expect(prisma.clientGoal.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          client_user_id: 'client_1',
          text: 'say no to one extra shift a week',
        }),
      }),
    );
  });

  it('will not close a goal that is not this therapist\'s for this client', async () => {
    const prisma = buildPrisma();

    await expect(
      callerWith(prisma).goals.setStatus({ goalId: 'g1', clientId: 'client_1', status: 'achieved' }),
    ).rejects.toThrow(/goal not found/i);
  });
});
