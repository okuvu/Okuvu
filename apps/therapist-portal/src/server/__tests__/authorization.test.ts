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
    },
    toolRegistryEntry: { findMany: vi.fn().mockResolvedValue([]) },
    sessionSummary: { findMany: vi.fn().mockResolvedValue([]) },
    turn: { findMany: vi.fn().mockResolvedValue([]) },
    userMemory: { findUnique: vi.fn().mockResolvedValue(null) },
    moodLog: { findMany: vi.fn().mockResolvedValue([]) },
    clinicalAccessLog: { create: vi.fn().mockResolvedValue({}) },
    appointment: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
      update: vi.fn().mockResolvedValue({}),
    },
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

  it('clients.detail surfaces careReviewFlagged only when chat_access_granted is true (okuvu-remaining-changes.md §C.3/§C.5)', async () => {
    const prisma = buildPrisma({
      therapistClient: { id: 'tc_1', chat_access_granted: true },
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

  it('clients.detail hides careReviewFlagged when chat_access_granted is false, even if the flag itself is true', async () => {
    const prisma = buildPrisma({
      therapistClient: { id: 'tc_1', chat_access_granted: false },
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

  it('clients.detail surfaces the consent chip fields (therapist-portal wireframes C-08)', async () => {
    const prisma = buildPrisma({
      therapistClient: { id: 'tc_1', chat_access_granted: true, chat_access_requested_at: null },
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

    expect(result.consent).toEqual({
      safety: true,
      mood: false,
      chatAccess: true,
      chatAccessRequestedAt: null,
    });
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
      data: { ended_at: expect.any(Date) },
    });
    expect(prisma.clinicalAccessLog.create).toHaveBeenCalledWith({
      data: { therapist_id: THERAPIST.id, client_user_id: 'client_1', action: 'END_CLIENT' },
    });
  });

  it('clients.requestChatAccess throws FORBIDDEN for an unassigned client', async () => {
    const caller = buildCaller();
    await expect(
      caller.clients.requestChatAccess({ clientUserId: UNASSIGNED_CLIENT_ID }),
    ).rejects.toThrow(/not assigned/i);
  });

  it('clients.requestChatAccess sets chat_access_requested_at and logs REQUEST_CHAT_ACCESS', async () => {
    const prisma = buildPrisma({ therapistClient: { id: 'tc_1' } });
    const caller = appRouter.createCaller({
      session: { user: { id: THERAPIST.id, email: THERAPIST.email, name: THERAPIST.name } },
      prisma,
      headers: new Headers(),
    });

    const result = await caller.clients.requestChatAccess({ clientUserId: 'client_1' });

    expect(result).toEqual({ success: true });
    expect(prisma.therapistClient.update).toHaveBeenCalledWith({
      where: { therapist_id_client_user_id: { therapist_id: THERAPIST.id, client_user_id: 'client_1' } },
      data: { chat_access_requested_at: expect.any(Date) },
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
    const prisma = buildPrisma({ therapistClient: { id: 'tc_1', chat_access_granted: false } });
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

  it('reportCard.sessionPrep returns granted:false without querying clinical data when consent is not granted', async () => {
    const prisma = buildPrisma({ therapistClient: { id: 'tc_1', chat_access_granted: false } });
    const caller = appRouter.createCaller({
      session: { user: { id: THERAPIST.id, email: THERAPIST.email, name: THERAPIST.name } },
      prisma,
      headers: new Headers(),
    });

    const result = await caller.reportCard.sessionPrep({ clientId: 'client_1' });

    expect(result).toEqual({ granted: false });
    expect(prisma.sessionSummary.findMany).not.toHaveBeenCalled();
    expect(prisma.clinicalAccessLog.create).not.toHaveBeenCalled();
  });

  it('reportCard.sessionPrep fetches entries and logs access when consent is granted', async () => {
    const prisma = buildPrisma({ therapistClient: { id: 'tc_1', chat_access_granted: true } });
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

    expect(result.granted).toBe(true);
    if (result.granted) {
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].narrativeSummary).toBe('Talked about work stress.');
    }
    expect(prisma.clinicalAccessLog.create).toHaveBeenCalledWith({
      data: { therapist_id: THERAPIST.id, client_user_id: 'client_1', action: 'VIEW_SESSION_PREP' },
    });
  });

  it('reportCard.reportCard returns aggregated data and logs access when consent is granted', async () => {
    const prisma = buildPrisma({ therapistClient: { id: 'tc_1', chat_access_granted: true } });
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
    const prisma = buildPrisma({ therapistClient: { id: 'tc_1', chat_access_granted: true } });
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
