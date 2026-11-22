import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PrismaClient } from '@okuvu/prisma';
import { appRouter } from '../routers/_app';

const THERAPIST = { id: 'th_1', email: 'therapist@okuvu.dev', name: 'Dr. Therapist' };
const CLIENT_ID = 'client_1';
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Per-session withholds must hold on every therapist-facing read, not just in
 * the portal tab a developer happened to remember.
 *
 * The client's own words: "the client can decide, per session, whether its
 * summary is shared". A withhold that a report card or the client profile
 * ignores is not a withhold — it is a checkbox.
 */

function buildPrisma(overrides: {
  assignment?: unknown;
  user?: unknown;
  summaries?: unknown[];
} = {}) {
  const assignment =
    'assignment' in overrides
      ? overrides.assignment
      : {
          id: 'tc_1',
          summary_access_granted_at: new Date(),
          summary_access_closed_at: null,
        };

  return {
    therapist: { findUnique: vi.fn().mockResolvedValue(THERAPIST) },
    therapistClient: {
      findUnique: vi.fn().mockResolvedValue(assignment),
      findFirst: vi.fn().mockResolvedValue({ id: 'tc_1' }),
    },
    user: {
      findUnique: vi.fn().mockResolvedValue(
        'user' in overrides
          ? overrides.user
          : {
              id: CLIENT_ID,
              client_code: 'C-1',
              full_name: 'A Client',
              email: 'client@okuvu.dev',
              age_confirmed_at: new Date(),
              age_declined_at: null,
              clinical_config: null,
              safety_state: null,
              engagement_profile: { consent_1: true, consent_2: false },
              session_summaries: [],
            },
      ),
    },
    sessionSummary: { findMany: vi.fn().mockResolvedValue(overrides.summaries ?? []) },
    homework: { groupBy: vi.fn().mockResolvedValue([]), findMany: vi.fn().mockResolvedValue([]) },
    userMemory: { findUnique: vi.fn().mockResolvedValue(null) },
    moodLog: { findMany: vi.fn().mockResolvedValue([]) },
    turn: { findMany: vi.fn().mockResolvedValue([]) },
    appointment: { findFirst: vi.fn().mockResolvedValue(null) },
    journalEntry: { findMany: vi.fn().mockResolvedValue([]) },
    worksheetResponse: { findMany: vi.fn().mockResolvedValue([]) },
    treasureNote: { findMany: vi.fn().mockResolvedValue([]) },
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

function summaryFindArgs(prisma: PrismaClient) {
  return (prisma.sessionSummary.findMany as any).mock.calls[0][0];
}

beforeEach(() => {
  delete process.env.LOCAL_DEV_BYPASS_AUTH;
});

describe('per-session summary withholds', () => {
  it('the client profile asks only for summaries without a withhold', async () => {
    const prisma = buildPrisma();
    await callerFor(prisma).clients.detail({ clientUserId: CLIENT_ID });

    const include = (prisma.user.findUnique as any).mock.calls[0][0].include;
    expect(include.session_summaries.where).toEqual({
      OR: [{ share_with_therapist: null }, { share_with_therapist: true }],
    });
  });

  it('the report card asks only for summaries without a withhold', async () => {
    const prisma = buildPrisma();
    await callerFor(prisma).reportCard.reportCard({ clientId: CLIENT_ID });

    expect(summaryFindArgs(prisma).where).toMatchObject({
      user_id: CLIENT_ID,
      status: 'COMPLETED',
      OR: [{ share_with_therapist: null }, { share_with_therapist: true }],
    });
  });

  it('the session-prep digest asks only for summaries without a withhold', async () => {
    const prisma = buildPrisma();
    await callerFor(prisma).reportCard.sessionPrep({ clientId: CLIENT_ID });

    expect(summaryFindArgs(prisma).where).toMatchObject({
      user_id: CLIENT_ID,
      status: 'COMPLETED',
      OR: [{ share_with_therapist: null }, { share_with_therapist: true }],
    });
  });

  it('a closed relationship window still returns the not-shared state, not a summary', async () => {
    const prisma = buildPrisma({
      assignment: {
        id: 'tc_1',
        summary_access_granted_at: new Date(Date.now() - 31 * DAY_MS),
        summary_access_closed_at: null,
      },
      user: {
        id: CLIENT_ID,
        client_code: 'C-1',
        full_name: 'A Client',
        email: 'client@okuvu.dev',
        age_confirmed_at: new Date(),
        age_declined_at: null,
        clinical_config: null,
        safety_state: null,
        engagement_profile: null,
        // Even if a row came back, the gate is the window — assert the state.
        session_summaries: [
          { status: 'COMPLETED', summary_text: '{"narrative_summary":"secret"}', session_id: 's1', session: {} },
        ],
      },
    });

    const detail = await callerFor(prisma).clients.detail({ clientUserId: CLIENT_ID });

    expect(detail.summary).toEqual({
      status: 'not_shared',
      summary_text: null,
      session_id: null,
    });
  });
});

/**
 * The report card's mood strip is a second reader of the same private rows. It
 * must carry each check-in's own share, not the summary consent switch: a client
 * who granted summaries has still not shared a single day's mood.
 */
describe('report card — mood check-ins obey their own share', () => {
  it('asks only for check-ins the client shared', async () => {
    const prisma = buildPrisma();
    await callerFor(prisma).reportCard.reportCard({ clientId: CLIENT_ID });

    const args = (prisma.moodLog.findMany as any).mock.calls[0][0];
    expect(args.where).toMatchObject({
      user_id: CLIENT_ID,
      shared_with_therapist: true,
    });
  });

  it('reports no trend when the client shared nothing', async () => {
    const prisma = buildPrisma();
    const card = await callerFor(prisma).reportCard.reportCard({ clientId: CLIENT_ID });
    if (!card.granted) throw new Error('expected a granted report card');
    expect(card.moodTrend).toEqual([]);
  });
});
