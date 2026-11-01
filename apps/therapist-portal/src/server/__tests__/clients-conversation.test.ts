import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { PrismaClient } from '@okuvu/prisma';
import { appRouter } from '../routers/_app';

/**
 * E16-S9 — clients.conversation.
 *
 * Mirrors clients-chat-access.test.ts's 30-day boundary suite (29 days in,
 * 31 days out) from the read side, then covers the two clauses that are
 * specific to this story: a client with no access row is refused, and a
 * successful read appends exactly one ClinicalAccessLog row.
 *
 * Unlike the chat-access suite these run with the bypass OFF — the bypass
 * short-circuits both assertClientAssigned and logClinicalAccess, which
 * would make the audit-row assertions vacuous.
 */

const THERAPIST = { id: 'th_1', email: 'therapist@okuvu.dev', name: 'Therapist One' };
const CLIENT_ID = 'client_1';
const CLIENT_EMAIL = 'client.one@example.test';
const CLIENT_NAME = 'Client One Real Name';

const THIRTY_ONE_DAYS_MS = 31 * 24 * 60 * 60 * 1000;
const TWENTY_NINE_DAYS_MS = 29 * 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

interface Overrides {
  assignment?: unknown;
  turns?: unknown[];
}

function buildPrisma(overrides: Overrides = {}) {
  // `in`-checks so an explicit `null` (a real lookup miss) isn't treated as
  // "not provided" — same convention as authorization.test.ts.
  const assignment =
    'assignment' in overrides
      ? overrides.assignment
      : { chat_access_requested_at: new Date(Date.now() - 24 * 60 * 60 * 1000) };

  return {
    therapist: { findUnique: vi.fn().mockResolvedValue(THERAPIST) },
    therapistClient: {
      findUnique: vi.fn().mockResolvedValue(assignment),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({}),
    },
    turn: { findMany: vi.fn().mockResolvedValue(overrides.turns ?? []) },
    // Only reached on the refusal path, where the page needs the consent
    // chip; never returned with content.
    user: {
      findUnique: vi.fn().mockResolvedValue({
        id: CLIENT_ID,
        phone_number: '+911234567890',
        email: CLIENT_EMAIL,
        full_name: CLIENT_NAME,
        clinical_config: null,
        safety_state: null,
        engagement_profile: { consent_1: false, consent_2: false },
        session_summaries: [],
      }),
    },
    clinicalAccessLog: { create: vi.fn().mockResolvedValue({}) },
  } as unknown as PrismaClient;
}

function callerWith(prisma: PrismaClient) {
  return appRouter.createCaller({
    session: { user: { id: THERAPIST.id, email: THERAPIST.email, name: THERAPIST.name } },
    prisma,
    headers: new Headers(),
  });
}

function turnRow(index: number, role: 'user' | 'assistant', content: string) {
  // Oldest first: turn 0 is the earliest.
  return {
    id: `turn_${String(index).padStart(3, '0')}`,
    session_id: 'session_1',
    user_id: CLIENT_ID,
    role,
    content,
    created_at: new Date(Date.UTC(2026, 9, 1, 10, index, 0)),
  };
}

const ORIGINAL_BYPASS = process.env.LOCAL_DEV_BYPASS_AUTH;

beforeEach(() => {
  delete process.env.LOCAL_DEV_BYPASS_AUTH;
});

afterEach(() => {
  if (ORIGINAL_BYPASS === undefined) {
    delete process.env.LOCAL_DEV_BYPASS_AUTH;
  } else {
    process.env.LOCAL_DEV_BYPASS_AUTH = ORIGINAL_BYPASS;
  }
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('clients.conversation — access window boundaries', () => {
  it('allows the read when chat access was requested 29 days ago', async () => {
    const prisma = buildPrisma({
      assignment: { chat_access_requested_at: new Date(Date.now() - TWENTY_NINE_DAYS_MS) },
      turns: [turnRow(0, 'user', 'I felt anxious today'), turnRow(1, 'assistant', 'What happened?')],
    });
    const caller = callerWith(prisma);

    const result = await caller.clients.conversation({ clientUserId: CLIENT_ID });

    expect(result.turns).toHaveLength(2);
    expect(prisma.turn.findMany).toHaveBeenCalledTimes(1);
  });

  it('refuses the read when chat access was requested 31 days ago', async () => {
    const prisma = buildPrisma({
      assignment: { chat_access_requested_at: new Date(Date.now() - THIRTY_ONE_DAYS_MS) },
      turns: [turnRow(0, 'user', 'I felt anxious today')],
    });
    const caller = callerWith(prisma);

    await expect(caller.clients.conversation({ clientUserId: CLIENT_ID })).rejects.toThrow(
      /chat access is not available/i,
    );
    // The transcript is never queried on a refusal…
    expect(prisma.turn.findMany).not.toHaveBeenCalled();
    // …and a refused read is not an access event.
    expect(prisma.clinicalAccessLog.create).not.toHaveBeenCalled();
  });

  it('refuses at the exact 30-day boundary (window is half-open)', async () => {
    const requestedAt = new Date(Date.now() - THIRTY_DAYS_MS);
    const prisma = buildPrisma({ assignment: { chat_access_requested_at: requestedAt } });
    const caller = callerWith(prisma);

    // Freeze the clock at the instant the window closes.
    const now = requestedAt.getTime() + THIRTY_DAYS_MS;
    vi.useFakeTimers();
    vi.setSystemTime(new Date(now));
    try {
      await expect(caller.clients.conversation({ clientUserId: CLIENT_ID })).rejects.toThrow(
        /chat access is not available/i,
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('refuses when chat access was never requested', async () => {
    const prisma = buildPrisma({ assignment: { chat_access_requested_at: null } });
    const caller = callerWith(prisma);

    await expect(caller.clients.conversation({ clientUserId: CLIENT_ID })).rejects.toThrow(
      /chat access is not available/i,
    );
    expect(prisma.turn.findMany).not.toHaveBeenCalled();
    expect(prisma.clinicalAccessLog.create).not.toHaveBeenCalled();
  });
});

describe('clients.conversation — assignment', () => {
  it('refuses when no TherapistClient row exists for the pair', async () => {
    const prisma = buildPrisma({ assignment: null });
    const caller = callerWith(prisma);

    await expect(caller.clients.conversation({ clientUserId: 'client_not_mine' })).rejects.toThrow(
      /not assigned/i,
    );
    expect(prisma.turn.findMany).not.toHaveBeenCalled();
    expect(prisma.clinicalAccessLog.create).not.toHaveBeenCalled();
  });
});

describe('clients.conversation — ClinicalAccessLog', () => {
  it('appends one VIEW_CONVERSATION row for the actor and client on success', async () => {
    const prisma = buildPrisma({ turns: [turnRow(0, 'user', 'hello')] });
    const caller = callerWith(prisma);

    await caller.clients.conversation({ clientUserId: CLIENT_ID });

    expect(prisma.clinicalAccessLog.create).toHaveBeenCalledTimes(1);
    expect(prisma.clinicalAccessLog.create).toHaveBeenCalledWith({
      data: {
        therapist_id: THERAPIST.id,
        client_user_id: CLIENT_ID,
        action: 'VIEW_CONVERSATION',
      },
    });
  });

  it('still returns the transcript if the access log write fails (best-effort, existing helper)', async () => {
    const prisma = buildPrisma({ turns: [turnRow(0, 'user', 'hello')] });
    (prisma.clinicalAccessLog.create as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('log write failed'),
    );
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const caller = callerWith(prisma);

    const result = await caller.clients.conversation({ clientUserId: CLIENT_ID });

    expect(result.turns).toHaveLength(1);
  });
});

describe('clients.conversation — transcript shape', () => {
  it('returns turns oldest-first with role, content and no author identity', async () => {
    // findMany is mocked to honour the newest-first query, like Prisma would.
    const rows = [
      turnRow(3, 'assistant', 'third'),
      turnRow(2, 'user', 'second'),
      turnRow(1, 'assistant', 'first reply'),
      turnRow(0, 'user', 'first'),
    ].sort((a, b) => b.created_at.getTime() - a.created_at.getTime());

    const prisma = buildPrisma({ turns: rows });
    const caller = callerWith(prisma);

    const result = await caller.clients.conversation({ clientUserId: CLIENT_ID });

    expect(result.turns.map((t) => t.content)).toEqual([
      'first',
      'first reply',
      'second',
      'third',
    ]);
    expect(result.turns.map((t) => t.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
    expect(Object.keys(result.turns[0]).sort()).toEqual([
      'content',
      'createdAt',
      'id',
      'role',
      'sessionId',
    ]);
    expect(result.nextCursor).toBeNull();
    expect(result.window.expiresAt).toBeTruthy();
  });

  it('paginates: a full page plus one sets nextCursor and trims to limit', async () => {
    const pageSize = 2;
    const rows = [turnRow(3, 'assistant', 'c'), turnRow(2, 'user', 'b'), turnRow(1, 'assistant', 'a')];
    const prisma = buildPrisma({ turns: rows });
    const caller = callerWith(prisma);

    const first = await caller.clients.conversation({ clientUserId: CLIENT_ID, limit: pageSize });

    expect(first.turns).toHaveLength(pageSize);
    expect(first.nextCursor).toBe('2026-10-01T10:02:00.000Z|turn_002');

    // Second page must key off the cursor, not an offset.
    (prisma.turn.findMany as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      turnRow(0, 'user', 'oldest'),
    ]);
    const second = await caller.clients.conversation({
      clientUserId: CLIENT_ID,
      limit: pageSize,
      cursor: first.nextCursor as string,
    });

    expect(second.turns.map((t) => t.content)).toEqual(['oldest']);
    expect(second.nextCursor).toBeNull();
    const secondCallArgs = (
      prisma.turn.findMany as unknown as ReturnType<typeof vi.fn>
    ).mock.calls[1][0];
    expect(secondCallArgs.where.OR).toEqual([
      { created_at: { lt: new Date('2026-10-01T10:02:00.000Z') } },
      { created_at: new Date('2026-10-01T10:02:00.000Z'), id: { lt: 'turn_002' } },
    ]);
  });

  it('rejects a malformed cursor instead of silently rewinding to page one', async () => {
    const prisma = buildPrisma({ turns: [turnRow(0, 'user', 'hello')] });
    const caller = callerWith(prisma);

    await expect(
      caller.clients.conversation({ clientUserId: CLIENT_ID, cursor: 'not-a-cursor' }),
    ).rejects.toThrow(/invalid page cursor/i);
    expect(prisma.turn.findMany).not.toHaveBeenCalled();
  });
});

describe('clients.conversation — no personal data on the new code path', () => {
  it('emits no console output carrying the therapist email or the client name/email', async () => {
    const spies = [
      vi.spyOn(console, 'log').mockImplementation(() => {}),
      vi.spyOn(console, 'info').mockImplementation(() => {}),
      vi.spyOn(console, 'warn').mockImplementation(() => {}),
      vi.spyOn(console, 'error').mockImplementation(() => {}),
      vi.spyOn(console, 'debug').mockImplementation(() => {}),
    ];

    const prisma = buildPrisma({
      turns: [turnRow(0, 'user', 'I felt anxious today'), turnRow(1, 'assistant', 'Tell me more')],
    });
    const caller = callerWith(prisma);

    const result = await caller.clients.conversation({ clientUserId: CLIENT_ID });

    const emitted = spies.flatMap((spy) => spy.mock.calls.map((call) => String(call.join(' '))));
    const haystack = emitted.join('\n');
    expect(haystack).not.toContain(THERAPIST.email);
    expect(haystack).not.toContain(CLIENT_EMAIL);
    expect(haystack).not.toContain(CLIENT_NAME);
    expect(haystack).not.toContain('@okuvu.dev');
    expect(haystack).not.toContain('@example.test');

    // The wire payload is content + ids only — no email, no full name, no
    // phone number, no therapist identity.
    const payload = JSON.stringify(result);
    expect(payload).not.toContain(CLIENT_EMAIL);
    expect(payload).not.toContain(CLIENT_NAME);
    expect(payload).not.toContain('+911234567890');
    expect(payload).not.toContain(THERAPIST.email);
    expect(payload).not.toContain('"email"');
    expect(payload).not.toContain('"name"');
  });

  it('logs nothing on the refusal path either', async () => {
    const spies = [
      vi.spyOn(console, 'log').mockImplementation(() => {}),
      vi.spyOn(console, 'info').mockImplementation(() => {}),
      vi.spyOn(console, 'warn').mockImplementation(() => {}),
      vi.spyOn(console, 'error').mockImplementation(() => {}),
      vi.spyOn(console, 'debug').mockImplementation(() => {}),
    ];

    const prisma = buildPrisma({
      assignment: { chat_access_requested_at: new Date(Date.now() - THIRTY_ONE_DAYS_MS) },
    });
    const caller = callerWith(prisma);

    await expect(caller.clients.conversation({ clientUserId: CLIENT_ID })).rejects.toThrow();

    const emitted = spies.flatMap((spy) => spy.mock.calls.map((call) => String(call.join(' '))));
    expect(emitted.join('\n')).not.toContain(THERAPIST.email);
  });
});
