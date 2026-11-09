import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PrismaClient } from '@okuvu/prisma';
import { appRouter } from '../routers/_app';

const THERAPIST = { id: 'th_1', email: 'therapist@okuvu.dev', name: 'Dr. Therapist' };
const CLIENT_ID = 'client_1';

/**
 * Step 9 — Session Prep's "since last session" section.
 *
 * Three properties are worth a test each, because each one is a rule the owner
 * stated and each one is easy to break later:
 *
 *  1. the shared half is shown WITHOUT chat access (sharing is its own
 *     consent, and a client may share their journal while keeping chat closed);
 *  2. the chat half is only queried when the client approved it, inside the
 *     30-day window — a query that never runs cannot leak;
 *  3. everything in the section describes and never judges.
 */

interface Overrides {
  /** What `therapistClient.findFirst` (the live-link check) answers. */
  link?: unknown;
  /** What `therapistClient.findUnique` (chat access timestamps) answers. */
  assignment?: unknown;
  lastSession?: { scheduled_at: Date } | null;
  summaries?: unknown[];
  journal?: unknown[];
  worksheets?: unknown[];
  notes?: unknown[];
  homework?: unknown[];
}

function buildPrisma(overrides: Overrides = {}) {
  const assignment =
    'assignment' in overrides
      ? overrides.assignment
      : { id: 'tc_1', chat_access_granted_at: null, chat_access_closed_at: null };

  return {
    therapist: { findUnique: vi.fn().mockResolvedValue(THERAPIST) },
    therapistClient: {
      findUnique: vi.fn().mockResolvedValue(assignment),
      findFirst: vi.fn().mockResolvedValue('link' in overrides ? overrides.link : { id: 'tc_1' }),
    },
    appointment: { findFirst: vi.fn().mockResolvedValue(overrides.lastSession ?? null) },
    sessionSummary: { findMany: vi.fn().mockResolvedValue(overrides.summaries ?? []) },
    journalEntry: { findMany: vi.fn().mockResolvedValue(overrides.journal ?? []) },
    worksheetResponse: { findMany: vi.fn().mockResolvedValue(overrides.worksheets ?? []) },
    treasureNote: { findMany: vi.fn().mockResolvedValue(overrides.notes ?? []) },
    homework: { findMany: vi.fn().mockResolvedValue(overrides.homework ?? []) },
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

beforeEach(() => {
  delete process.env.LOCAL_DEV_BYPASS_AUTH;
});

describe('Session Prep — since the last session', () => {
  it('shows shared entries and notes without chat access', async () => {
    const prisma = buildPrisma({
      assignment: { chat_access_granted_at: null, chat_access_closed_at: null },
      journal: [{ id: 'j1', created_at: new Date('2026-11-08T09:00:00Z'), emotion: 'anxious' }],
      notes: [{ id: 'n1', title: 'A line that helped', created_at: new Date('2026-11-07T09:00:00Z') }],
    });

    const prep = await callerFor(prisma).reportCard.sessionPrep({ clientId: CLIENT_ID });

    expect(prep.chatGranted).toBe(false);
    expect(prep.entries).toEqual([]);
    expect(prep.shared.total).toBe(2);
    expect(prep.shared.journal).toBe(1);
    expect(prep.shared.notes).toBe(1);
    expect(prep.shared.items.map((i) => i.title)).toEqual([
      'Journal · anxious',
      'A line that helped',
    ]);
    // Newest first.
    expect(prep.shared.items[0].at).toBe('2026-11-08T09:00:00.000Z');
  });

  it('asks for shared rows only, on every surface that holds client text', async () => {
    const prisma = buildPrisma();
    await callerFor(prisma).reportCard.sessionPrep({ clientId: CLIENT_ID });

    for (const model of ['journalEntry', 'worksheetResponse', 'treasureNote'] as const) {
      const args = (prisma[model].findMany as any).mock.calls[0][0];
      expect(args.where).toMatchObject({
        user_id: CLIENT_ID,
        shared_with_therapist: true,
      });
    }
  });

  it('does not query chat summaries without the client approval', async () => {
    const prisma = buildPrisma({
      assignment: { chat_access_granted_at: null, chat_access_closed_at: null },
    });

    await callerFor(prisma).reportCard.sessionPrep({ clientId: CLIENT_ID });

    expect(prisma.sessionSummary.findMany).not.toHaveBeenCalled();
    expect(prisma.clinicalAccessLog.create).not.toHaveBeenCalled();
  });

  it('queries chat summaries inside the window and logs the read', async () => {
    const prisma = buildPrisma({
      assignment: { chat_access_granted_at: new Date(), chat_access_closed_at: null },
      summaries: [
        {
          session_id: 's1',
          summary_text: JSON.stringify({ narrative_summary: 'Talked about exams.', themes: ['exams'], open_loops: [] }),
          created_at: new Date('2026-11-08T09:00:00Z'),
        },
      ],
    });

    const prep = await callerFor(prisma).reportCard.sessionPrep({ clientId: CLIENT_ID });

    expect(prep.chatGranted).toBe(true);
    expect(prep.entries).toHaveLength(1);
    expect(prisma.clinicalAccessLog.create).toHaveBeenCalledWith({
      data: { therapist_id: THERAPIST.id, client_user_id: CLIENT_ID, action: 'VIEW_SESSION_PREP' },
    });
  });

  it('shows done and not done for assignments, with no answers selected', async () => {
    const prisma = buildPrisma({
      homework: [
        {
          id: 'hw_1',
          description: 'Practice breathing',
          frequency: 'once_daily',
          due_at: new Date('2026-11-10T00:00:00Z'),
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
          status: 'active',
          last_completed_at: null,
          tool: { label: 'Thought record' },
          completions: [],
        },
      ],
    });

    const prep = await callerFor(prisma).reportCard.sessionPrep({ clientId: CLIENT_ID });

    expect(prep.assignments).toEqual([
      expect.objectContaining({ label: 'Practice breathing', done: true, repeating: true }),
      expect.objectContaining({ label: 'Thought record', done: false, repeating: false }),
    ]);

    const select = JSON.stringify((prisma.homework.findMany as any).mock.calls[0][0].select);
    expect(select).not.toContain('answers');
    expect(select).not.toContain('barriers');
    expect(select).not.toContain('feeling_');
  });

  it("shows the client's \"What I want to bring to session\" only when that response is shared", async () => {
    const shared = buildPrisma({
      worksheets: [
        {
          id: 'w1',
          worksheet_id: 'ws_bring_to_session',
          answers: { bring: 'I want to talk about the exam timetable.' },
          completed_at: new Date('2026-11-08T09:00:00Z'),
          worksheet: { label: 'What I want to bring to session' },
        },
      ],
    });

    const shown = await callerFor(shared).reportCard.sessionPrep({ clientId: CLIENT_ID });
    expect(shown.bringToSession).toBe('I want to talk about the exam timetable.');

    // When nothing is shared the router never receives that row at all, so the
    // field is null rather than empty-but-present.
    const hidden = buildPrisma({ worksheets: [] });
    const notShown = await callerFor(hidden).reportCard.sessionPrep({ clientId: CLIENT_ID });
    expect(notShown.bringToSession).toBeNull();
    const args = (hidden.worksheetResponse.findMany as any).mock.calls[0][0];
    expect(args.where.shared_with_therapist).toBe(true);
  });

  it('measures the section from the last session, not from a fixed window', async () => {
    const prisma = buildPrisma({ lastSession: { scheduled_at: new Date('2026-11-01T10:00:00Z') } });

    const prep = await callerFor(prisma).reportCard.sessionPrep({ clientId: CLIENT_ID });

    expect(prep.since).toBe('2026-11-01T10:00:00.000Z');
    const args = (prisma.journalEntry.findMany as any).mock.calls[0][0];
    expect(args.where.created_at.gte.toISOString()).toBe('2026-11-01T10:00:00.000Z');
  });

  it('describes and never judges', async () => {
    const prisma = buildPrisma({
      lastSession: { scheduled_at: new Date('2026-11-01T10:00:00Z') },
      journal: [{ id: 'j1', created_at: new Date('2026-11-08T09:00:00Z'), emotion: null }],
      worksheets: [
        {
          id: 'w1',
          worksheet_id: 'ws_thought_record',
          answers: { thought: 'The exam will go badly.' },
          completed_at: new Date('2026-11-08T09:00:00Z'),
          worksheet: { label: 'Thought record' },
        },
      ],
      homework: [
        {
          id: 'hw_1',
          description: 'Practice breathing',
          frequency: 'once',
          due_at: null,
          status: 'active',
          last_completed_at: null,
          tool: null,
          completions: [],
        },
      ],
    });

    const prep = await callerFor(prisma).reportCard.sessionPrep({ clientId: CLIENT_ID });

    // Only the descriptive half — the chat narratives are the model's own prose
    // and are not what this rule governs.
    const descriptive = JSON.stringify({
      shared: prep.shared,
      assignments: prep.assignments,
      bringToSession: prep.bringToSession,
      since: prep.since,
    }).toLowerCase();

    for (const word of [
      'better',
      'worse',
      'improv',
      'deteriorat',
      'declin',
      'non-compliant',
      'noncompliant',
      'resistan',
      'unmotivated',
      'poor',
      'good progress',
      'no progress',
      'struggl',
      'engaged',
      'score',
    ]) {
      expect(descriptive).not.toContain(word);
    }

    // And it does say the two plain facts it is allowed to say.
    expect(prep.assignments[0].done).toBe(false);
    expect(prep.shared.total).toBe(2);
  });

  it('refuses a therapist whose link has ended', async () => {
    const prisma = buildPrisma({
      link: null,
      journal: [{ id: 'j1', created_at: new Date(), emotion: null }],
    });

    await expect(
      callerFor(prisma).reportCard.sessionPrep({ clientId: CLIENT_ID }),
    ).rejects.toThrow(/not linked to your caseload/);
    expect(prisma.journalEntry.findMany).not.toHaveBeenCalled();
  });
});
