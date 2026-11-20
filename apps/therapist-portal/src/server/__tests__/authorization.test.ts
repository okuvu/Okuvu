import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PrismaClient } from '@okuvu/prisma';
import { appRouter } from '../routers/_app';

const THERAPIST = { id: 'th_1', email: 'therapist@evia.dev', name: 'Dr. Therapist' };
const UNASSIGNED_CLIENT_ID = 'client_not_mine';

interface CtxOverrides {
  therapist?: unknown;
  therapistClient?: unknown;
  user?: unknown;
}

function buildPrisma(overrides: CtxOverrides = {}) {
  // `??` treats an explicit `null` override (meaning "no such row") the
  // same as "not provided" — use `in`/`undefined` checks so tests can
  // deliberately mock a lookup miss.
  const therapist = 'therapist' in overrides ? overrides.therapist : THERAPIST;
  const therapistClient = 'therapistClient' in overrides ? overrides.therapistClient : null;
  const user = 'user' in overrides ? overrides.user : null;

  return {
    therapist: { findUnique: vi.fn().mockResolvedValue(therapist) },
    therapistClient: {
      findUnique: vi.fn().mockResolvedValue(therapistClient),
      findFirst: vi.fn().mockResolvedValue(therapistClient),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({}),
    },
    user: { findUnique: vi.fn().mockResolvedValue(user) },
    clinicalConfig: { findUnique: vi.fn(), upsert: vi.fn() },
    therapistNote: { findMany: vi.fn(), create: vi.fn() },
    homework: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn(),
      groupBy: vi.fn().mockResolvedValue([]),
    },
    reminder: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    toolRegistryEntry: { findMany: vi.fn().mockResolvedValue([]) },
    sessionSummary: { findMany: vi.fn().mockResolvedValue([]) },
    turn: { findMany: vi.fn().mockResolvedValue([]) },
    userMemory: { findUnique: vi.fn().mockResolvedValue(null) },
    moodLog: { findMany: vi.fn().mockResolvedValue([]) },
    clinicalAccessLog: { create: vi.fn().mockResolvedValue({}) },
    appointment: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn().mockResolvedValue(null),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
      update: vi.fn().mockResolvedValue({}),
    },
    // Step 9 — Session Prep's shared half reads these three, always filtered on
    // `shared_with_therapist`. They answer empty here, so a test that cares
    // about the shared section overrides them explicitly.
    journalEntry: { findMany: vi.fn().mockResolvedValue([]) },
    worksheetResponse: { findMany: vi.fn().mockResolvedValue([]) },
    treasureNote: { findMany: vi.fn().mockResolvedValue([]) },
    $transaction: vi.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  } as unknown as PrismaClient;
}

function buildCaller(overrides: CtxOverrides = {}) {
  return appRouter.createCaller({
    session: { user: { id: THERAPIST.id, email: THERAPIST.email, name: THERAPIST.name } },
    prisma: buildPrisma(overrides),
    headers: new Headers(),
  });
}

beforeEach(() => {
  delete process.env.LOCAL_DEV_BYPASS_AUTH;
});

describe('authorization: a therapist can never reach a client not assigned to them', () => {
  it('clients.detail throws FORBIDDEN', async () => {
    const caller = buildCaller();
    await expect(
      caller.clients.detail({ clientUserId: UNASSIGNED_CLIENT_ID }),
    ).rejects.toThrow(/not assigned/i);
  });

  it('clients.getCarePlan throws FORBIDDEN', async () => {
    const caller = buildCaller();
    await expect(
      caller.clients.getCarePlan({ clientId: UNASSIGNED_CLIENT_ID }),
    ).rejects.toThrow(/not assigned/i);
  });

  it('clients.setCarePlan throws FORBIDDEN', async () => {
    const caller = buildCaller();
    await expect(
      caller.clients.setCarePlan({ clientId: UNASSIGNED_CLIENT_ID, carePlanId: 'CP1' }),
    ).rejects.toThrow(/not assigned/i);
  });

  it('notes.listNotes throws FORBIDDEN', async () => {
    const caller = buildCaller();
    await expect(
      caller.notes.listNotes({ clientId: UNASSIGNED_CLIENT_ID }),
    ).rejects.toThrow(/not assigned/i);
  });

  it('notes.addNote throws FORBIDDEN', async () => {
    const caller = buildCaller();
    await expect(
      caller.notes.addNote({ clientUserId: UNASSIGNED_CLIENT_ID, noteText: 'hello' }),
    ).rejects.toThrow(/not assigned/i);
  });

  it('homework.listHomework throws FORBIDDEN', async () => {
    const caller = buildCaller();
    await expect(
      caller.homework.listHomework({ clientId: UNASSIGNED_CLIENT_ID }),
    ).rejects.toThrow(/not assigned/i);
  });

  it('homework.assign throws FORBIDDEN', async () => {
    const caller = buildCaller();
    await expect(
      caller.homework.assign({ clientUserId: UNASSIGNED_CLIENT_ID, description: 'Practice breathing.' }),
    ).rejects.toThrow(/not assigned/i);
  });

  it('homework.markCompleted throws FORBIDDEN', async () => {
    const caller = buildCaller();
    await expect(
      caller.homework.markCompleted({ homeworkId: 'hw_1', clientId: UNASSIGNED_CLIENT_ID }),
    ).rejects.toThrow(/not assigned/i);
  });

  it('reminders.listReminders throws FORBIDDEN', async () => {
    const caller = buildCaller();
    await expect(
      caller.reminders.listReminders({ clientId: UNASSIGNED_CLIENT_ID }),
    ).rejects.toThrow(/not assigned/i);
  });

  it('reminders.create throws FORBIDDEN', async () => {
    const caller = buildCaller();
    await expect(
      caller.reminders.create({
        clientUserId: UNASSIGNED_CLIENT_ID,
        scheduleNote: 'Try box breathing.',
        frequency: 'as_needed',
        times: [],
      }),
    ).rejects.toThrow(/not assigned/i);
  });

  it('reminders.setActive throws FORBIDDEN', async () => {
    const caller = buildCaller();
    await expect(
      caller.reminders.setActive({ id: 'rem_1', clientUserId: UNASSIGNED_CLIENT_ID, active: false }),
    ).rejects.toThrow(/not assigned/i);
  });

  it('reportCard.sessionPrep throws FORBIDDEN', async () => {
    const caller = buildCaller();
    await expect(
      caller.reportCard.sessionPrep({ clientId: UNASSIGNED_CLIENT_ID }),
    ).rejects.toThrow(/not assigned/i);
  });

  it('reportCard.reportCard throws FORBIDDEN', async () => {
    const caller = buildCaller();
    await expect(
      caller.reportCard.reportCard({ clientId: UNASSIGNED_CLIENT_ID }),
    ).rejects.toThrow(/not assigned/i);
  });
});

describe('authorization: unauthenticated or unknown-therapist sessions', () => {
  it('rejects a request with no session user', async () => {
    const caller = appRouter.createCaller({
      session: null,
      prisma: buildPrisma(),
      headers: new Headers(),
    });
    await expect(caller.clients.list()).rejects.toThrow();
  });

  it('rejects a session email with no matching Therapist row', async () => {
    const caller = buildCaller({ therapist: null });
    await expect(caller.clients.list()).rejects.toThrow(/therapist not found/i);
  });
});

describe('authorization: an assigned therapist can read their own client', () => {
  it('clients.detail succeeds and records a clinical access log entry', async () => {
    const prisma = buildPrisma({
      therapistClient: { id: 'tc_1' },
      user: {
        id: 'client_1',
        phone_number: '+911234567890',
        clinical_config: null,
        safety_state: null,
        session_summaries: [],
      },
    });
    const caller = appRouter.createCaller({
      session: { user: { id: THERAPIST.id, email: THERAPIST.email, name: THERAPIST.name } },
      prisma,
      headers: new Headers(),
    });

    const result = await caller.clients.detail({ clientUserId: 'client_1' });

    expect(result.id).toBe('client_1');
    expect(prisma.clinicalAccessLog.create).toHaveBeenCalledWith({
      data: { therapist_id: THERAPIST.id, client_user_id: 'client_1', action: 'VIEW_CLIENT_DETAIL' },
    });
  });

  it('clients.detail surfaces careReviewFlagged when the client is inside their summary window (okuvu-remaining-changes.md §C.3/§C.5)', async () => {
    const prisma = buildPrisma({
      // The client's own approval, 2 days ago: inside the 30-day window.
      therapistClient: {
        id: 'tc_1',
        summary_access_granted: true,
        summary_access_granted_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        summary_access_closed_at: null,
      },
      user: {
        id: 'client_1',
        phone_number: '+911234567890',
        clinical_config: { care_plan_id: 'CP1', assignment_state: 'confirmed', reasoning_note: null, care_plan_review_flagged: true },
        safety_state: null,
        session_summaries: [],
      },
    });
    const caller = appRouter.createCaller({
      session: { user: { id: THERAPIST.id, email: THERAPIST.email, name: THERAPIST.name } },
      prisma,
      headers: new Headers(),
    });

    const result = await caller.clients.detail({ clientUserId: 'client_1' });

    expect(result.careReviewFlagged).toBe(true);
  });

  it('clients.detail hides careReviewFlagged when summary_access_granted is false, even if the flag itself is true', async () => {
    const prisma = buildPrisma({
      therapistClient: { id: 'tc_1', summary_access_granted: false },
      user: {
        id: 'client_1',
        phone_number: '+911234567890',
        clinical_config: { care_plan_id: 'CP1', assignment_state: 'confirmed', reasoning_note: null, care_plan_review_flagged: true },
        safety_state: null,
        session_summaries: [],
      },
    });
    const caller = appRouter.createCaller({
      session: { user: { id: THERAPIST.id, email: THERAPIST.email, name: THERAPIST.name } },
      prisma,
      headers: new Headers(),
    });

    const result = await caller.clients.detail({ clientUserId: 'client_1' });

    expect(result.careReviewFlagged).toBe(false);
  });

  // The two tests below are the reason this change exists. Before them, the
  // profile card read SessionSummary directly and showed the narrative to any
  // assigned therapist — so a client who never consented, or whose 30 days had
  // run out, still had their summaries on the therapist's screen.
  it('clients.detail shows no summary at all to a therapist who set the flag themselves (no client timestamp)', async () => {
    const prisma = buildPrisma({
      // What the old admin.assignClient form could produce: the boolean, and no
      // approval from the client — so no window.
      therapistClient: { id: 'tc_1', summary_access_granted: true, summary_access_granted_at: null },
      user: {
        id: 'client_1',
        phone_number: '+911234567890',
        clinical_config: { care_plan_id: 'CP1', assignment_state: 'confirmed', reasoning_note: 'therapist-only note', care_plan_review_flagged: false },
        safety_state: null,
        session_summaries: [
          {
            status: 'COMPLETED',
            summary_text: JSON.stringify({ narrative_summary: 'Client described a hard week at work.' }),
            session_id: 'session-1',
            last_updated_at: new Date(),
            session: null,
          },
        ],
      },
    });
    const caller = appRouter.createCaller({
      session: { user: { id: THERAPIST.id, email: THERAPIST.email, name: THERAPIST.name } },
      prisma,
      headers: new Headers(),
    });

    const result = await caller.clients.detail({ clientUserId: 'client_1' });

    expect(result.summary.status).toBe('not_shared');
    expect(result.summary.summary_text).toBeNull();
    expect(result.reasoningNote).toBeNull();
  });

  it('clients.detail shows no summary once the client\'s 30-day window has expired', async () => {
    const prisma = buildPrisma({
      therapistClient: {
        id: 'tc_1',
        summary_access_granted: true,
        summary_access_granted_at: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
        summary_access_closed_at: null,
      },
      user: {
        id: 'client_1',
        phone_number: '+911234567890',
        clinical_config: null,
        safety_state: null,
        session_summaries: [
          {
            status: 'COMPLETED',
            summary_text: JSON.stringify({ narrative_summary: 'Older session.' }),
            session_id: 'session-0',
            last_updated_at: new Date(),
            session: null,
          },
        ],
      },
    });
    const caller = appRouter.createCaller({
      session: { user: { id: THERAPIST.id, email: THERAPIST.email, name: THERAPIST.name } },
      prisma,
      headers: new Headers(),
    });

    const result = await caller.clients.detail({ clientUserId: 'client_1' });

    expect(result.summary.status).toBe('not_shared');
    expect(result.summary.summary_text).toBeNull();
  });

  it('clients.detail surfaces the consent line and the two-sided age attestation', async () => {
    const prisma = buildPrisma({
      therapistClient: { id: 'tc_1', summary_access_granted: true, summary_access_requested_at: null },
      user: {
        id: 'client_1',
        phone_number: '+911234567890',
        clinical_config: null,
        safety_state: null,
        engagement_profile: { consent_1: true, consent_2: false },
        session_summaries: [],
      },
    });
    const caller = appRouter.createCaller({
      session: { user: { id: THERAPIST.id, email: THERAPIST.email, name: THERAPIST.name } },
      prisma,
      headers: new Headers(),
    });

    const result = await caller.clients.detail({ clientUserId: 'client_1' });

    // Portal P0 — the old four-boolean `consent` object (safety · mood ·
    // summaryAccess) is gone. Mood sharing is a plain boolean and chat access is
    // a four-state value that the read gate also uses, so the sentence the
    // therapist reads cannot disagree with the gate. This client has
    // summary_access_granted = true but no approval timestamp, i.e. a grant from
    // before approval recorded a time: it opens nothing.
    expect(result.moodShared).toBe(false);
    expect(result.summaryAccess).toEqual({ state: 'not_requested' });
    expect(result.ageConfirmedByTherapistAt).toBeNull();
    expect(result.ageConfirmedByClientAt).toBeNull();
    // The masked phone is no longer part of the client's wire shape at all.
    expect(result).not.toHaveProperty('phoneNumber');
  });

  it('clients.detail derives status from activated_at/ended_at (therapist-portal wireframes C-07)', async () => {
    const prisma = buildPrisma({
      therapistClient: { id: 'tc_1', activated_at: new Date('2026-09-01T00:00:00Z'), ended_at: null },
      user: {
        id: 'client_1',
        phone_number: '+911234567890',
        clinical_config: null,
        safety_state: null,
        session_summaries: [],
      },
    });
    const caller = appRouter.createCaller({
      session: { user: { id: THERAPIST.id, email: THERAPIST.email, name: THERAPIST.name } },
      prisma,
      headers: new Headers(),
    });

    const result = await caller.clients.detail({ clientUserId: 'client_1' });

    expect(result.status).toBe('active');
  });

  it('clients.end throws FORBIDDEN for an unassigned client', async () => {
    const caller = buildCaller();
    await expect(
      caller.clients.end({ clientUserId: UNASSIGNED_CLIENT_ID }),
    ).rejects.toThrow(/not assigned/i);
  });

  it('clients.end sets ended_at and logs END_CLIENT', async () => {
    const prisma = buildPrisma({ therapistClient: { id: 'tc_1' } });
    const caller = appRouter.createCaller({
      session: { user: { id: THERAPIST.id, email: THERAPIST.email, name: THERAPIST.name } },
      prisma,
      headers: new Headers(),
    });

    const result = await caller.clients.end({ clientUserId: 'client_1' });

    expect(result).toEqual({ success: true });
    expect(prisma.therapistClient.update).toHaveBeenCalledWith({
      where: { therapist_id_client_user_id: { therapist_id: THERAPIST.id, client_user_id: 'client_1' } },
      // Portal P0 — ending care also closes the chat read window, which is now
      // the client's approval rather than the therapist's request.
      data: { ended_at: expect.any(Date), summary_access_closed_at: expect.any(Date) },
    });
    expect(prisma.clinicalAccessLog.create).toHaveBeenCalledWith({
      data: { therapist_id: THERAPIST.id, client_user_id: 'client_1', action: 'END_CLIENT' },
    });
  });

  it('clients.requestSummaryAccess throws FORBIDDEN for an unassigned client', async () => {
    const caller = buildCaller();
    await expect(
      caller.clients.requestSummaryAccess({ clientUserId: UNASSIGNED_CLIENT_ID }),
    ).rejects.toThrow(/not assigned/i);
  });

  it('clients.requestSummaryAccess sets summary_access_requested_at and logs REQUEST_CHAT_ACCESS', async () => {
    const prisma = buildPrisma({ therapistClient: { id: 'tc_1' } });
    const caller = appRouter.createCaller({
      session: { user: { id: THERAPIST.id, email: THERAPIST.email, name: THERAPIST.name } },
      prisma,
      headers: new Headers(),
    });

    const result = await caller.clients.requestSummaryAccess({ clientUserId: 'client_1' });

    expect(result).toEqual({ success: true });
    expect(prisma.therapistClient.update).toHaveBeenCalledWith({
      where: { therapist_id_client_user_id: { therapist_id: THERAPIST.id, client_user_id: 'client_1' } },
      data: { summary_access_requested_at: expect.any(Date) },
    });
    expect(prisma.clinicalAccessLog.create).toHaveBeenCalledWith({
      data: { therapist_id: THERAPIST.id, client_user_id: 'client_1', action: 'REQUEST_CHAT_ACCESS' },
    });
  });

  it('homework.listHomework succeeds and records a clinical access log entry', async () => {
    const prisma = buildPrisma({ therapistClient: { id: 'tc_1' } });
    const caller = appRouter.createCaller({
      session: { user: { id: THERAPIST.id, email: THERAPIST.email, name: THERAPIST.name } },
      prisma,
      headers: new Headers(),
    });

    const result = await caller.homework.listHomework({ clientId: 'client_1' });

    expect(result).toEqual([]);
    expect(prisma.clinicalAccessLog.create).toHaveBeenCalledWith({
      data: { therapist_id: THERAPIST.id, client_user_id: 'client_1', action: 'VIEW_HOMEWORK' },
    });
  });

  it('homework.assign succeeds for an assigned client', async () => {
    const prisma = buildPrisma({ therapistClient: { id: 'tc_1' } });
    vi.mocked(prisma.homework.create).mockResolvedValue({
      id: 'hw_1',
      status: 'active',
      assigned_at: new Date('2026-09-11'),
    } as never);
    const caller = appRouter.createCaller({
      session: { user: { id: THERAPIST.id, email: THERAPIST.email, name: THERAPIST.name } },
      prisma,
      headers: new Headers(),
    });

    const result = await caller.homework.assign({
      clientUserId: 'client_1',
      description: 'Practice box breathing before bed.',
    });

    expect(result.id).toBe('hw_1');
    expect(prisma.homework.create).toHaveBeenCalledWith({
      data: {
        therapist_id: THERAPIST.id,
        client_user_id: 'client_1',
        description: 'Practice box breathing before bed.',
      },
      select: { id: true, status: true, assigned_at: true },
    });
  });
});

describe('§D reminders + report-card', () => {
  it('reminders.listReminders succeeds and records a clinical access log entry', async () => {
    const prisma = buildPrisma({ therapistClient: { id: 'tc_1' } });
    const caller = appRouter.createCaller({
      session: { user: { id: THERAPIST.id, email: THERAPIST.email, name: THERAPIST.name } },
      prisma,
      headers: new Headers(),
    });

    const result = await caller.reminders.listReminders({ clientId: 'client_1' });

    expect(result).toEqual([]);
    expect(prisma.clinicalAccessLog.create).toHaveBeenCalledWith({
      data: { therapist_id: THERAPIST.id, client_user_id: 'client_1', action: 'VIEW_REMINDERS' },
    });
  });

  it('reportCard.reportCard returns granted:false without querying clinical data when consent is not granted', async () => {
    const prisma = buildPrisma({ therapistClient: { id: 'tc_1', summary_access_granted: false } });
    const caller = appRouter.createCaller({
      session: { user: { id: THERAPIST.id, email: THERAPIST.email, name: THERAPIST.name } },
      prisma,
      headers: new Headers(),
    });

    const result = await caller.reportCard.reportCard({ clientId: 'client_1' });

    expect(result).toEqual({ granted: false });
    expect(prisma.sessionSummary.findMany).not.toHaveBeenCalled();
    expect(prisma.clinicalAccessLog.create).not.toHaveBeenCalled();
  });

  it('reportCard.sessionPrep returns no chat summaries when consent is not granted, but still shows what was shared', async () => {
    const prisma = buildPrisma({ therapistClient: { id: 'tc_1', summary_access_granted: false } });
    const caller = appRouter.createCaller({
      session: { user: { id: THERAPIST.id, email: THERAPIST.email, name: THERAPIST.name } },
      prisma,
      headers: new Headers(),
    });

    const result = await caller.reportCard.sessionPrep({ clientId: 'client_1' });

    expect(result.chatGranted).toBe(false);
    expect(result.entries).toEqual([]);
    expect(prisma.sessionSummary.findMany).not.toHaveBeenCalled();
    // Step 9: the shared half is not gated on chat access. A client can share
    // their journal and keep chat private; sharing is its own consent.
    expect(prisma.journalEntry.findMany).toHaveBeenCalled();
    expect(prisma.clinicalAccessLog.create).not.toHaveBeenCalled();
  });

  it('reportCard.sessionPrep fetches entries and logs access when consent is granted', async () => {
    const prisma = buildPrisma({ therapistClient: { id: 'tc_1', summary_access_granted: true, summary_access_granted_at: new Date(), summary_access_closed_at: null } });
    vi.mocked(prisma.sessionSummary.findMany).mockResolvedValue([
      {
        session_id: 'sess_1',
        summary_text: JSON.stringify({ narrative_summary: 'Talked about work stress.', themes: ['work'], open_loops: [] }),
        created_at: new Date('2026-09-01T00:00:00Z'),
      },
    ] as never);
    const caller = appRouter.createCaller({
      session: { user: { id: THERAPIST.id, email: THERAPIST.email, name: THERAPIST.name } },
      prisma,
      headers: new Headers(),
    });

    const result = await caller.reportCard.sessionPrep({ clientId: 'client_1' });

    expect(result.chatGranted).toBe(true);
    if (result.chatGranted) {
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].narrativeSummary).toBe('Talked about work stress.');
    }
    expect(prisma.clinicalAccessLog.create).toHaveBeenCalledWith({
      data: { therapist_id: THERAPIST.id, client_user_id: 'client_1', action: 'VIEW_SESSION_PREP' },
    });
  });

  it('reportCard.reportCard returns aggregated data and logs access when consent is granted', async () => {
    const prisma = buildPrisma({ therapistClient: { id: 'tc_1', summary_access_granted: true, summary_access_granted_at: new Date(), summary_access_closed_at: null } });
    vi.mocked(prisma.homework.groupBy).mockResolvedValue([
      { status: 'active', _count: 2 },
      { status: 'completed', _count: 3 },
    ] as never);
    const caller = appRouter.createCaller({
      session: { user: { id: THERAPIST.id, email: THERAPIST.email, name: THERAPIST.name } },
      prisma,
      headers: new Headers(),
    });

    const result = await caller.reportCard.reportCard({ clientId: 'client_1' });

    expect(result.granted).toBe(true);
    if (result.granted) {
      expect(result.homeworkCounts).toEqual({ active: 2, completed: 3 });
      expect(result.signals).toEqual({
        latestTaperState: 'none',
        closureOfferedRecently: false,
        frustrationEventCount: 0,
        therapistReferralRecently: false,
      });
    }
    expect(prisma.clinicalAccessLog.create).toHaveBeenCalledWith({
      data: { therapist_id: THERAPIST.id, client_user_id: 'client_1', action: 'VIEW_REPORT_CARD' },
    });
  });

  it('reportCard.reportCard computes S-07 signal flags from recent turns (okuvu-remaining-changes.md §C.2)', async () => {
    const prisma = buildPrisma({ therapistClient: { id: 'tc_1', summary_access_granted: true, summary_access_granted_at: new Date(), summary_access_closed_at: null } });
    vi.mocked(prisma.turn.findMany).mockResolvedValue([
      { taper_state: 'tapering', closure_offered: true, frustration_event: false, therapist_referral: false, created_at: new Date('2026-09-12') },
      { taper_state: 'none', closure_offered: false, frustration_event: true, therapist_referral: true, created_at: new Date('2026-09-10') },
      { taper_state: 'none', closure_offered: false, frustration_event: true, therapist_referral: false, created_at: new Date('2026-09-08') },
    ] as never);
    const caller = appRouter.createCaller({
      session: { user: { id: THERAPIST.id, email: THERAPIST.email, name: THERAPIST.name } },
      prisma,
      headers: new Headers(),
    });

    const result = await caller.reportCard.reportCard({ clientId: 'client_1' });

    expect(result.granted).toBe(true);
    if (result.granted) {
      expect(result.signals).toEqual({
        latestTaperState: 'tapering',
        closureOfferedRecently: true,
        frustrationEventCount: 2,
        therapistReferralRecently: true,
      });
    }
  });
});

describe('authorization: homework.markCompleted ownership check (defense in depth)', () => {
  it('throws NOT_FOUND when the homework row belongs to a different client than claimed, even though the therapist IS assigned to the claimed client', async () => {
    const prisma = buildPrisma({ therapistClient: { id: 'tc_1' } });
    vi.mocked(prisma.homework.findUnique).mockResolvedValue({
      therapist_id: THERAPIST.id,
      client_user_id: 'a_different_client',
    } as never);
    const caller = appRouter.createCaller({
      session: { user: { id: THERAPIST.id, email: THERAPIST.email, name: THERAPIST.name } },
      prisma,
      headers: new Headers(),
    });

    await expect(
      caller.homework.markCompleted({ homeworkId: 'hw_1', clientId: 'client_1' }),
    ).rejects.toThrow(/not found/i);
    expect(prisma.homework.update).not.toHaveBeenCalled();
  });

  it('throws NOT_FOUND when the homework row was assigned by a different therapist', async () => {
    const prisma = buildPrisma({ therapistClient: { id: 'tc_1' } });
    vi.mocked(prisma.homework.findUnique).mockResolvedValue({
      therapist_id: 'a_different_therapist',
      client_user_id: 'client_1',
    } as never);
    const caller = appRouter.createCaller({
      session: { user: { id: THERAPIST.id, email: THERAPIST.email, name: THERAPIST.name } },
      prisma,
      headers: new Headers(),
    });

    await expect(
      caller.homework.markCompleted({ homeworkId: 'hw_1', clientId: 'client_1' }),
    ).rejects.toThrow(/not found/i);
    expect(prisma.homework.update).not.toHaveBeenCalled();
  });

  it('succeeds and updates status to completed when ownership matches', async () => {
    const prisma = buildPrisma({ therapistClient: { id: 'tc_1' } });
    vi.mocked(prisma.homework.findUnique).mockResolvedValue({
      therapist_id: THERAPIST.id,
      client_user_id: 'client_1',
    } as never);
    vi.mocked(prisma.homework.update).mockResolvedValue({
      id: 'hw_1',
      status: 'completed',
      updated_at: new Date('2026-09-11'),
    } as never);
    const caller = appRouter.createCaller({
      session: { user: { id: THERAPIST.id, email: THERAPIST.email, name: THERAPIST.name } },
      prisma,
      headers: new Headers(),
    });

    const result = await caller.homework.markCompleted({ homeworkId: 'hw_1', clientId: 'client_1' });

    expect(result.status).toBe('completed');
    expect(prisma.homework.update).toHaveBeenCalledWith({
      where: { id: 'hw_1' },
      data: { status: 'completed' },
      select: { id: true, status: true, updated_at: true },
    });
  });
});

describe('Step 4 — the Report Card and Session Prep follow the chat-access rule', () => {
  const callerFor = (prisma: PrismaClient) =>
    appRouter.createCaller({
      session: { user: { id: THERAPIST.id, email: THERAPIST.email, name: THERAPIST.name } },
      prisma,
      headers: new Headers(),
    });

  it('refuses when the flag is on but there is no client approval timestamp', async () => {
    // The therapist set the switch; the client never approved. A bare boolean
    // read here is how that becomes a read.
    const prisma = buildPrisma({
      therapistClient: { id: 'tc_1', summary_access_granted: true, summary_access_granted_at: null, summary_access_closed_at: null },
    });

    const prep = await callerFor(prisma).reportCard.sessionPrep({ clientId: 'client_1' });
    const card = await callerFor(prisma).reportCard.reportCard({ clientId: 'client_1' });

    expect(prep.chatGranted).toBe(false);
    expect(prep.entries).toEqual([]);
    expect(card).toEqual({ granted: false });
    expect(prisma.sessionSummary.findMany).not.toHaveBeenCalled();
  });

  it('refuses once the 30-day window from the client\'s approval has closed', async () => {
    const thirtyOneDaysAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    const prisma = buildPrisma({
      therapistClient: {
        id: 'tc_1',
        summary_access_granted: true,
        summary_access_granted_at: thirtyOneDaysAgo,
        summary_access_closed_at: null,
      },
    });

    const prep = await callerFor(prisma).reportCard.sessionPrep({ clientId: 'client_1' });
    const card = await callerFor(prisma).reportCard.reportCard({ clientId: 'client_1' });

    expect(prep.chatGranted).toBe(false);
    expect(card).toEqual({ granted: false });
  });

  it('refuses when the client has closed access, even inside the window', async () => {
    const prisma = buildPrisma({
      therapistClient: {
        id: 'tc_1',
        summary_access_granted: true,
        summary_access_granted_at: new Date(),
        summary_access_closed_at: new Date(),
      },
    });

    const prep = await callerFor(prisma).reportCard.sessionPrep({ clientId: 'client_1' });
    expect(prep.chatGranted).toBe(false);
    expect(prep.entries).toEqual([]);
  });
});
