import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PrismaClient } from '@okuvu/prisma';
import { appRouter } from '../routers/_app';

const THERAPIST = { id: 'th_1', email: 'therapist@okuvu.dev', name: 'Dr. Therapist' };
const CLIENT_ID = 'client_1';

interface Overrides {
  link?: unknown;
  journal?: unknown[];
  worksheets?: unknown[];
  notes?: unknown[];
  homework?: unknown[];
}

function buildPrisma(overrides: Overrides = {}) {
  return {
    therapist: { findUnique: vi.fn().mockResolvedValue(THERAPIST) },
    therapistClient: {
      findFirst: vi.fn().mockResolvedValue('link' in overrides ? overrides.link : { id: 'tc_1' }),
    },
    journalEntry: {
      findMany: vi.fn().mockResolvedValue(overrides.journal ?? []),
    },
    worksheetResponse: {
      findMany: vi.fn().mockResolvedValue(overrides.worksheets ?? []),
    },
    treasureNote: {
      findMany: vi.fn().mockResolvedValue(overrides.notes ?? []),
    },
    homework: {
      findMany: vi.fn().mockResolvedValue(overrides.homework ?? []),
    },
    clinicalAccessLog: { create: vi.fn().mockResolvedValue({}) },
  } as unknown as PrismaClient;
}

function callerFor(prisma: PrismaClient) {
  return appRouter.createCaller({
    session: { user: { id: THERAPIST.id, email: THERAPIST.email, name: THERAPIST.name } },
    prisma,
    headers: new Headers(),
  });
}

/**
 * The portal's only read of client writing. These tests pin the two properties
 * that make "private" mean something: the shared flag is in every WHERE clause,
 * and a dead link reads nothing even when rows are shared.
 */
describe('shared router — nothing private reaches the portal', () => {
  beforeEach(() => {
    delete process.env.LOCAL_DEV_BYPASS_AUTH;
  });

  it('asks only for rows the client shared, on all three surfaces', async () => {
    const prisma = buildPrisma();
    await callerFor(prisma).shared.list({ clientId: CLIENT_ID });

    for (const model of ['journalEntry', 'worksheetResponse', 'treasureNote'] as const) {
      const args = (prisma[model].findMany as any).mock.calls[0][0];
      expect(args.where).toMatchObject({
        user_id: CLIENT_ID,
        shared_with_therapist: true,
      });
    }
  });

  it('refuses a therapist who is no longer linked, even when things are shared', async () => {
    const prisma = buildPrisma({
      link: null,
      journal: [{ id: 'j1', content: 'shared while linked', created_at: new Date(), emotion: null }],
    });

    await expect(callerFor(prisma).shared.list({ clientId: CLIENT_ID })).rejects.toThrow(
      /not linked to your caseload/,
    );
    expect(prisma.journalEntry.findMany).not.toHaveBeenCalled();
  });

  it('returns nothing for a client who has shared nothing', async () => {
    const view = await callerFor(buildPrisma()).shared.list({ clientId: CLIENT_ID });
    expect(view.items).toEqual([]);
  });

  it('carries the worksheet self-ratings and the helped answer', async () => {
    const prisma = buildPrisma({
      worksheets: [
        {
          id: 'w1',
          answers: { thought: 'I always fail' },
          completed_at: new Date('2026-11-09T10:00:00Z'),
          feeling_before: 8,
          feeling_after: 4,
          helped: true,
          worksheet: { label: 'Thought record' },
        },
      ],
    });

    const view = await callerFor(prisma).shared.list({ clientId: CLIENT_ID });
    expect(view.items[0]).toMatchObject({
      kind: 'worksheet_response',
      title: 'Thought record',
      feelingBefore: 8,
      feelingAfter: 4,
      helped: true,
    });
    expect(view.items[0].body).toContain('I always fail');
  });

  it('logs the read as clinical access without recording any text', async () => {
    const prisma = buildPrisma({
      journal: [{ id: 'j1', content: 'A very private sentence.', created_at: new Date(), emotion: null }],
    });

    await callerFor(prisma).shared.list({ clientId: CLIENT_ID });

    expect(prisma.clinicalAccessLog.create).toHaveBeenCalledWith({
      data: {
        therapist_id: THERAPIST.id,
        client_user_id: CLIENT_ID,
        action: expect.stringContaining('shared_items_read'),
      },
    });
    const action = (prisma.clinicalAccessLog.create as any).mock.calls[0][0].data.action as string;
    expect(action).not.toContain('private sentence');
  });
});

/**
 * Step 9 — patterns and assignment status. The rule these pin is that the two
 * additions cannot become a back door: patterns are built from shared rows
 * only, and assignment status carries none of the client's words.
 */
describe('shared router — patterns and assignment status', () => {
  beforeEach(() => {
    delete process.env.LOCAL_BYPASS_AUTH;
    delete process.env.LOCAL_DEV_BYPASS_AUTH;
  });

  const buildPrisma2 = (overrides: Overrides = {}) => buildPrisma(overrides);

  it('builds each exercise pattern from shared responses only, oldest first', async () => {
    const prisma = buildPrisma2({
      worksheets: [
        {
          id: 'w2',
          worksheet_id: 'ws_thought_record',
          answers: { thought: 'newer' },
          completed_at: new Date('2026-11-08T10:00:00Z'),
          feeling_before: 7,
          feeling_after: 4,
          barriers: 'Too tired',
          helped: true,
          worksheet: { label: 'Thought record' },
        },
        {
          id: 'w1',
          worksheet_id: 'ws_thought_record',
          answers: { thought: 'older' },
          completed_at: new Date('2026-11-01T10:00:00Z'),
          feeling_before: 9,
          feeling_after: 6,
          barriers: null,
          helped: false,
          worksheet: { label: 'Thought record' },
        },
      ],
    });

    const view = await callerFor(prisma).shared.list({ clientId: CLIENT_ID });

    expect(view.patterns).toHaveLength(1);
    const pattern = view.patterns[0];
    expect(pattern.occurrences).toBe(2);
    expect(pattern.points.map((p) => p.before)).toEqual([9, 7]);
    expect(pattern.beforeRange).toEqual({ low: 7, high: 9 });
    expect(pattern.afterRange).toEqual({ low: 4, high: 6 });
    expect(pattern.barriers).toEqual(['Too tired']);
    // The WHERE clause is what makes the count trustworthy.
    const args = (prisma.worksheetResponse.findMany as any).mock.calls[0][0];
    expect(args.where).toMatchObject({ user_id: CLIENT_ID, shared_with_therapist: true });
  });

  it('never counts an unshared response, even in the occurrence total', async () => {
    // The router asks the database for shared rows; a private row is not in the
    // result set at all, so it cannot appear as a count, a title or a date.
    const prisma = buildPrisma2({ worksheets: [] });
    const view = await callerFor(prisma).shared.list({ clientId: CLIENT_ID });

    expect(view.patterns).toEqual([]);
    expect(view.items).toEqual([]);
    const args = (prisma.worksheetResponse.findMany as any).mock.calls[0][0];
    expect(args.where.shared_with_therapist).toBe(true);
  });

  it('reports done and not done for assignments without any client text', async () => {
    const prisma = buildPrisma2({
      homework: [
        {
          id: 'hw_1',
          description: 'Practice breathing',
          frequency: 'once_daily',
          due_at: new Date('2026-11-10T00:00:00Z'),
          assigned_at: new Date('2026-11-09T00:00:00Z'),
          status: 'active',
          last_completed_at: new Date('2026-11-09T12:00:00Z'),
          tool: null,
          completions: [],
        },
        {
          id: 'hw_2',
          description: 'Thought record',
          frequency: 'once',
          due_at: null,
          assigned_at: new Date('2026-11-08T00:00:00Z'),
          status: 'active',
          last_completed_at: null,
          tool: { label: 'Thought record' },
          completions: [],
        },
      ],
    });

    const view = await callerFor(prisma).shared.list({ clientId: CLIENT_ID });

    expect(view.assignments).toEqual([
      expect.objectContaining({ homeworkId: 'hw_1', label: 'Practice breathing', done: true, repeating: true }),
      expect.objectContaining({ homeworkId: 'hw_2', label: 'Thought record', done: false, repeating: false }),
    ]);
    // The select must not reach for answers, ratings or barriers.
    const select = JSON.stringify((prisma.homework.findMany as any).mock.calls[0][0].select);
    expect(select).not.toContain('answers');
    expect(select).not.toContain('barriers');
    expect(select).not.toContain('feeling_');
  });
});
