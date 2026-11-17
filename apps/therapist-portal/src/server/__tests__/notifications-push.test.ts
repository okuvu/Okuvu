import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { PrismaClient } from '@okuvu/prisma';
import { appRouter } from '../routers/_app';

/**
 * Push as the second sender on the row.
 *
 * The four properties that matter, and that a phone cannot tell you:
 *
 * 1. A therapist's assignment buzzes the handset — the whole point of the
 *    feature, and the thing missing while every client relied on email.
 * 2. A client with **no email address** still buzzes. The write path returns
 *    early without an address, which is right for email and would have silently
 *    cost push its only delivery route.
 * 3. A push that fails never stops the row or the therapist's form from
 *    succeeding. The row is the record of care.
 * 4. A client who switched appointment reminders off is not buzzed *and* gets no
 *    row — one gate, both surfaces.
 */

const ORIGINAL_BYPASS = process.env.LOCAL_DEV_BYPASS_AUTH;
const CLIENT_ID = 'client_1';
const THERAPIST = { id: 'th_1', email: 'therapist@okuvu.dev', name: 'Dr. Therapist' };

const { sendClientPushMock } = vi.hoisted(() => ({ sendClientPushMock: vi.fn() }));

vi.mock('../push', () => ({ sendClientPush: sendClientPushMock }));

const RECIPIENT = {
  email: 'client@example.com',
  appointment_reminders_enabled: true,
  update_emails_enabled: false,
  email_update_token: null,
};

function buildPrisma(user: Record<string, unknown> | null = RECIPIENT) {
  const appointment = {
    id: 'appt_2',
    therapist_id: THERAPIST.id,
    client_user_id: CLIENT_ID,
    scheduled_at: new Date('2026-11-20T11:00:00Z'),
    duration_minutes: 50,
    mode: 'video',
    location: null,
    note_to_client: null,
    remind_24h: false,
    remind_1h: false,
    rescheduled_from: null,
    cancelled_at: null,
  };

  return {
    therapist: { findUnique: vi.fn().mockResolvedValue(THERAPIST) },
    therapistClient: { findUnique: vi.fn().mockResolvedValue({ id: 'tc_1' }) },
    toolRegistryEntry: {
      findUnique: vi.fn().mockResolvedValue({
        tool_id: 'box_breathing',
        label: 'Box breathing',
        status: 'approved',
        kind: 'exercise',
      }),
    },
    homework: {
      create: vi.fn().mockResolvedValue({
        id: 'hw_1',
        status: 'active',
        assigned_at: new Date('2026-11-17T00:00:00.000Z'),
      }),
    },
    appointment: {
      create: vi.fn().mockResolvedValue(appointment),
      findMany: vi.fn().mockResolvedValue([]),
    },
    clinicalAccessLog: { create: vi.fn().mockResolvedValue({}) },
    notification: { create: vi.fn().mockResolvedValue({ id: 'ntf_1' }) },
    user: { findUnique: vi.fn().mockResolvedValue(user) },
    $transaction: vi.fn((ops: unknown[]) => Promise.all(ops as Promise<unknown>[])),
  } as unknown as PrismaClient;
}

function callerWith(prisma: PrismaClient) {
  return appRouter.createCaller({
    session: { user: THERAPIST },
    prisma,
    headers: new Headers(),
  });
}

describe('push fires beside the notification row', () => {
  beforeEach(() => {
    process.env.LOCAL_DEV_BYPASS_AUTH = 'true';
    vi.clearAllMocks();
    sendClientPushMock.mockResolvedValue({ sent: true });
  });

  afterEach(() => {
    process.env.LOCAL_DEV_BYPASS_AUTH = ORIGINAL_BYPASS;
  });

  it('buzzes the client when an exercise is assigned', async () => {
    const prisma = buildPrisma();
    const caller = callerWith(prisma);

    await caller.homework.assign({
      clientUserId: CLIENT_ID,
      toolId: 'box_breathing',
      description: 'Try this before bed.',
    });

    expect(sendClientPushMock).toHaveBeenCalledTimes(1);
    const args = sendClientPushMock.mock.calls[0][0] as Record<string, unknown>;
    expect(args.clientUserId).toBe(CLIENT_ID);
    expect(args.kind).toBe('homework_assigned');
    // The row's prose stays in the row; only a kind reaches the lock screen.
    expect(args).not.toHaveProperty('body');
  });

  it('buzzes a client who has no email address on file', async () => {
    const prisma = buildPrisma({ ...RECIPIENT, email: null });
    const caller = callerWith(prisma);

    await caller.homework.assign({
      clientUserId: CLIENT_ID,
      toolId: 'box_breathing',
      description: 'Try this before bed.',
    });

    expect(sendClientPushMock).toHaveBeenCalledTimes(1);
  });

  it('does not cost the therapist anything when the push fails', async () => {
    sendClientPushMock.mockRejectedValue(new Error('fcm down'));
    const prisma = buildPrisma();
    const caller = callerWith(prisma);

    await expect(
      caller.homework.assign({
        clientUserId: CLIENT_ID,
        toolId: 'box_breathing',
        description: 'Try this before bed.',
      }),
    ).resolves.toBeDefined();

    expect(prisma.notification.create).toHaveBeenCalled();
  });

  it('never buzzes a client whose appointment reminders are switched off', async () => {
    const prisma = buildPrisma({ ...RECIPIENT, appointment_reminders_enabled: false });
    const caller = callerWith(prisma);

    await caller.appointments.create({
      clientUserId: CLIENT_ID,
      scheduledAt: '2026-11-20T11:00:00.000Z',
      mode: 'video',
    });

    expect(sendClientPushMock).not.toHaveBeenCalled();
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it('names the session time when an appointment is booked', async () => {
    const prisma = buildPrisma();
    const caller = callerWith(prisma);

    await caller.appointments.create({
      clientUserId: CLIENT_ID,
      scheduledAt: '2026-11-20T11:00:00.000Z',
      mode: 'video',
    });

    expect(sendClientPushMock).toHaveBeenCalledTimes(1);
    const args = sendClientPushMock.mock.calls[0][0] as { kind: string; appointmentAt: Date | null };
    expect(args.kind).toBe('appointment_booked');
    expect(args.appointmentAt?.toISOString()).toBe('2026-11-20T11:00:00.000Z');
  });
});
