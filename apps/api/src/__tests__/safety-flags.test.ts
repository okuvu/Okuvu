/**
 * Safety flags — the write path, and the two clinical rules around it.
 *
 *   1. The write never changes what the client receives: nothing here throws
 *      into a turn, whatever the database does.
 *   2. A failed write is retried, not dropped, and a retry after a committed
 *      insert must not count the same crisis twice.
 *
 * Plus the alert email's contents: a therapist's inbox gets the label, the
 * level, the time and a link — never a message, a summary or a reasoning note.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { prismaMock, emailMock } = vi.hoisted(() => ({
  prismaMock: {
    safetyFlag: { create: vi.fn() },
    therapistClient: { findMany: vi.fn() },
  },
  emailMock: { sendSafetyAlertEmail: vi.fn() },
}));

vi.mock('../lib/prisma.js', () => ({ prisma: prismaMock }));
vi.mock('../lib/email.js', () => emailMock);

const ORIGINAL_ENV = { ...process.env };

async function load() {
  return import('../lib/safety-flags.js');
}

function createdRow(level: 'S3' | 'S4' = 'S4') {
  return { id: 'flag_1', user_id: 'user_1', level, occurred_at: new Date('2026-11-02T10:00:00Z') };
}

describe('recordSafetyFlag', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    emailMock.sendSafetyAlertEmail.mockResolvedValue({ sent: true });
    prismaMock.therapistClient.findMany.mockResolvedValue([
      { client_label: 'A. (Tuesdays)', therapist: { email: 't@example.test', name: 'Dr Rao' } },
    ]);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it.each(['S0', 'S1', 'S2'])('does not record %s — only S3/S4 are flags', async (level) => {
    const { recordSafetyFlag } = await load();
    const result = await recordSafetyFlag({ userId: 'user_1', level, source: 's3_grounding' });
    expect(result).toBeNull();
    expect(prismaMock.safetyFlag.create).not.toHaveBeenCalled();
  });

  it('records an S4 with the screen that was served and the turn it belongs to', async () => {
    prismaMock.safetyFlag.create.mockResolvedValue(createdRow('S4'));
    const { recordSafetyFlag } = await load();

    const result = await recordSafetyFlag({
      userId: 'user_1',
      level: 'S4',
      source: 'crisis_card',
      sessionId: 'sess_1',
      turnId: 'turn_1',
    });

    expect(result?.id).toBe('flag_1');
    expect(prismaMock.safetyFlag.create).toHaveBeenCalledWith({
      data: {
        user_id: 'user_1',
        level: 'S4',
        source: 'crisis_card',
        session_id: 'sess_1',
        turn_id: 'turn_1',
        crisis_screen_shown: true,
        subject_kind: null,
        subject_id: null,
      },
      select: { id: true, user_id: true, level: true, occurred_at: true },
    });
  });

  it('records a non-chat write with the row it came from, and never its text', async () => {
    prismaMock.safetyFlag.create.mockResolvedValueOnce(createdRow('S3'));
    const { recordSafetyFlag } = await load();

    const result = await recordSafetyFlag({
      userId: 'user_1',
      level: 'S3',
      source: 'journal_entry',
      subjectKind: 'journal_entry',
      subjectId: 'entry_9',
    });

    expect(result?.id).toBe('flag_1');
    const [call] = prismaMock.safetyFlag.create.mock.calls[0];
    expect(call.data).toEqual({
      user_id: 'user_1',
      level: 'S3',
      source: 'journal_entry',
      session_id: null,
      turn_id: null,
      crisis_screen_shown: true,
      subject_kind: 'journal_entry',
      subject_id: 'entry_9',
    });
    // The one thing a flag must never carry.
    expect(JSON.stringify(call.data)).not.toContain('content');
    expect(JSON.stringify(call.data)).not.toContain('text');
  });

  it('never throws when the insert fails, and retries in the background', async () => {
    prismaMock.safetyFlag.create
      .mockRejectedValueOnce(new Error('connection reset'))
      .mockResolvedValueOnce(createdRow('S3'));
    const { recordSafetyFlag } = await load();

    // The turn path awaits this: it must return, not throw.
    const result = await recordSafetyFlag({ userId: 'user_1', level: 'S3', source: 's3_grounding' });
    expect(result).toBeNull();
    expect(prismaMock.safetyFlag.create).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(300);

    expect(prismaMock.safetyFlag.create).toHaveBeenCalledTimes(2);
  });

  it('treats a unique violation as already recorded — one flag per turn', async () => {
    const error = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
    prismaMock.safetyFlag.create.mockRejectedValue(error);
    const { recordSafetyFlag } = await load();

    const result = await recordSafetyFlag({
      userId: 'user_1',
      level: 'S4',
      source: 'crisis_card',
      turnId: 'turn_dup',
    });

    expect(result).toBeNull();
    await vi.advanceTimersByTimeAsync(2000);
    // No retry: the row exists, so retrying would only re-collide.
    expect(prismaMock.safetyFlag.create).toHaveBeenCalledTimes(1);
  });
});

describe('notifyTherapistsOfSafetyFlag', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    emailMock.sendSafetyAlertEmail.mockResolvedValue({ sent: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('emails each active therapist the label, level, time and link only', async () => {
    prismaMock.therapistClient.findMany.mockResolvedValue([
      { client_label: 'A. (Tuesdays)', therapist: { email: 't@example.test', name: 'Dr Rao' } },
    ]);
    const { notifyTherapistsOfSafetyFlag } = await load();

    await notifyTherapistsOfSafetyFlag({
      user_id: 'user_1',
      level: 'S4',
      occurred_at: new Date('2026-11-02T10:00:00Z'),
    });

    expect(emailMock.sendSafetyAlertEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 't@example.test',
        clientLabel: 'A. (Tuesdays)',
        level: 'S4',
        link: expect.stringContaining('/clients/user_1#safety'),
      }),
    );
    // Nothing clinical rides along: the call is the whole payload.
    const payload = emailMock.sendSafetyAlertEmail.mock.calls[0][0];
    expect(Object.keys(payload).sort()).toEqual(
      ['clientLabel', 'level', 'link', 'occurredAt', 'therapistName', 'to'].sort(),
    );
  });

  it('swallows a send failure rather than failing the turn', async () => {
    prismaMock.therapistClient.findMany.mockResolvedValue([
      { client_label: 'A.', therapist: { email: 't@example.test', name: null } },
    ]);
    emailMock.sendSafetyAlertEmail.mockRejectedValue(new Error('BREVO_API_KEY is not set'));
    const { notifyTherapistsOfSafetyFlag } = await load();

    await expect(
      notifyTherapistsOfSafetyFlag({ user_id: 'user_1', level: 'S3', occurred_at: new Date() }),
    ).resolves.toBeUndefined();
  });
});
