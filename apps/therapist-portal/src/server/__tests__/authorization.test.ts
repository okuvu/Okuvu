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
    },
    user: { findUnique: vi.fn().mockResolvedValue(user) },
    clinicalConfig: { findUnique: vi.fn(), upsert: vi.fn() },
    therapistNote: { findMany: vi.fn(), create: vi.fn() },
    clinicalAccessLog: { create: vi.fn().mockResolvedValue({}) },
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
});
