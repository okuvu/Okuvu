import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PrismaClient } from '@okuvu/prisma';
import { appRouter } from '../routers/_app';

const THERAPIST = { id: 'th_1', email: 'therapist@okuvu.dev', name: 'Dr. Therapist' };
const CLIENT_ID = 'client_1';
const UNASSIGNED_CLIENT_ID = 'client_not_mine';

interface Overrides {
  therapistClient?: unknown;
  appointment?: unknown;
}

function buildPrisma(overrides: Overrides = {}) {
  const therapistClient = 'therapistClient' in overrides ? overrides.therapistClient : { id: 'tc_1' };
  const appointment = 'appointment' in overrides ? overrides.appointment : null;

  return {
    therapist: { findUnique: vi.fn().mockResolvedValue(THERAPIST) },
    therapistClient: { findUnique: vi.fn().mockResolvedValue(therapistClient) },
    // The notification emitter reads this to honour Settings → Appointment
    // reminders before writing a row (see server/notifications.ts).
    user: { findUnique: vi.fn().mockResolvedValue({ appointment_reminders_enabled: true }) },
    notification: { create: vi.fn().mockResolvedValue({}) },
    appointment: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(appointment),
      update: vi.fn().mockResolvedValue({
        id: 'appt_2',
        therapist_id: THERAPIST.id,
        client_user_id: CLIENT_ID,
        scheduled_at: new Date('2026-09-20T12:30:00Z'),
        duration_minutes: 50,
        mode: 'video',
        location: null,
        note_to_client: null,
        remind_24h: false,
        remind_1h: false,
        rescheduled_from: null,
        cancelled_at: null,
      }),
      create: vi.fn().mockResolvedValue({
        id: 'appt_2',
        therapist_id: THERAPIST.id,
        client_user_id: CLIENT_ID,
        scheduled_at: new Date('2026-09-20T12:30:00Z'),
        duration_minutes: 50,
        mode: 'video',
        location: null,
        note_to_client: null,
        remind_24h: false,
        remind_1h: false,
        rescheduled_from: 'appt_1',
        cancelled_at: null,
      }),
    },
    clinicalAccessLog: { create: vi.fn().mockResolvedValue({}) },
    $transaction: vi.fn((ops: unknown[]) => Promise.all(ops)),
  } as unknown as PrismaClient;
}

function buildCaller(overrides: Overrides = {}) {
  return appRouter.createCaller({
    session: { user: { id: THERAPIST.id, email: THERAPIST.email, name: THERAPIST.name } },
    prisma: buildPrisma(overrides),
    headers: new Headers(),
  });
}

beforeEach(() => {
  delete process.env.LOCAL_DEV_BYPASS_AUTH;
});

describe('appointments (therapist-portal wireframes P-01..P-04)', () => {
  it('create throws FORBIDDEN for an unassigned client', async () => {
    const caller = buildCaller({ therapistClient: null });
    await expect(
      caller.appointments.create({
        clientUserId: UNASSIGNED_CLIENT_ID,
        scheduledAt: '2026-09-20T12:30:00.000Z',
        mode: 'video',
      }),
    ).rejects.toThrow(/not assigned/i);
  });

  it('create materializes N rows for repeatWeeklyCount and logs CREATE_APPOINTMENT', async () => {
    const prisma = buildPrisma();
    const caller = appRouter.createCaller({
      session: { user: { id: THERAPIST.id, email: THERAPIST.email, name: THERAPIST.name } },
      prisma,
      headers: new Headers(),
    });

    const result = await caller.appointments.create({
      clientUserId: CLIENT_ID,
      scheduledAt: '2026-09-20T12:30:00.000Z',
      mode: 'video',
      repeatWeeklyCount: 3,
    });

    expect(result).toEqual({ success: true, count: 3 });
    expect(prisma.appointment.create).toHaveBeenCalledTimes(3);
    const rows = vi
      .mocked(prisma.appointment.create)
      .mock.calls.map((call) => call[0].data as { scheduled_at: Date });
    expect(rows[0]).toMatchObject({ therapist_id: THERAPIST.id, client_user_id: CLIENT_ID });
    // Each row 7 days apart.
    expect(rows[1].scheduled_at.getTime() - rows[0].scheduled_at.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
    expect(prisma.clinicalAccessLog.create).toHaveBeenCalledWith({
      data: { therapist_id: THERAPIST.id, client_user_id: CLIENT_ID, action: 'CREATE_APPOINTMENT' },
    });
  });

  it('create tells the client once, not once per repeated session', async () => {
    const prisma = buildPrisma();
    const caller = appRouter.createCaller({
      session: { user: { id: THERAPIST.id, email: THERAPIST.email, name: THERAPIST.name } },
      prisma,
      headers: new Headers(),
    });

    await caller.appointments.create({
      clientUserId: CLIENT_ID,
      scheduledAt: '2026-09-20T12:30:00.000Z',
      mode: 'video',
      repeatWeeklyCount: 4,
    });

    // Four sessions booked, one inbox row — the client does not get four
    // identical "appointment booked" entries for one booking action.
    expect(prisma.notification.create).toHaveBeenCalledTimes(1);
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        user_id: CLIENT_ID,
        kind: 'appointment_booked',
        appointment_id: 'appt_2',
      }),
    });
    const data = vi.mocked(prisma.notification.create).mock.calls[0]?.[0].data as { body: string; title: string };
    expect(data.title).toBe('Appointments booked');
    expect(data.body).toContain('4 sessions');
  });

  it('create writes nothing when the client switched appointment reminders off', async () => {
    const prisma = buildPrisma();
    // Settings → Notifications → Appointment reminders = off.
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      appointment_reminders_enabled: false,
    } as never);
    const caller = appRouter.createCaller({
      session: { user: { id: THERAPIST.id, email: THERAPIST.email, name: THERAPIST.name } },
      prisma,
      headers: new Headers(),
    });

    await caller.appointments.create({
      clientUserId: CLIENT_ID,
      scheduledAt: '2026-09-20T12:30:00.000Z',
      mode: 'video',
    });

    // The appointment still exists — only the notification is suppressed.
    expect(prisma.appointment.create).toHaveBeenCalledTimes(1);
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it('reschedule cancels the old row and creates a new one with rescheduled_from set', async () => {
    const prisma = buildPrisma({
      appointment: {
        therapist_id: THERAPIST.id,
        client_user_id: CLIENT_ID,
        scheduled_at: new Date('2026-09-13T12:30:00Z'),
      },
    });
    const caller = appRouter.createCaller({
      session: { user: { id: THERAPIST.id, email: THERAPIST.email, name: THERAPIST.name } },
      prisma,
      headers: new Headers(),
    });

    const result = await caller.appointments.reschedule({
      appointmentId: 'appt_1',
      clientUserId: CLIENT_ID,
      scheduledAt: '2026-09-20T12:30:00.000Z',
      mode: 'video',
    });

    expect(result.rescheduledFrom).toBe('appt_1');
    expect(prisma.appointment.update).toHaveBeenCalledWith({
      where: { id: 'appt_1' },
      data: { cancelled_at: expect.any(Date) },
    });
    expect(prisma.appointment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ rescheduled_from: 'appt_1' }),
    });
  });

  it('reschedule throws NOT_FOUND for an appointment belonging to a different client', async () => {
    const prisma = buildPrisma({
      appointment: { therapist_id: THERAPIST.id, client_user_id: 'someone_else' },
    });
    const caller = appRouter.createCaller({
      session: { user: { id: THERAPIST.id, email: THERAPIST.email, name: THERAPIST.name } },
      prisma,
      headers: new Headers(),
    });

    await expect(
      caller.appointments.reschedule({
        appointmentId: 'appt_1',
        clientUserId: CLIENT_ID,
        scheduledAt: '2026-09-20T12:30:00.000Z',
        mode: 'video',
      }),
    ).rejects.toThrow(/not found/i);
  });

  it('cancel sets cancelled_at and never deletes, logs CANCEL_APPOINTMENT', async () => {
    const prisma = buildPrisma({
      appointment: {
        therapist_id: THERAPIST.id,
        client_user_id: CLIENT_ID,
        scheduled_at: new Date('2026-09-20T12:30:00Z'),
      },
    });
    const caller = appRouter.createCaller({
      session: { user: { id: THERAPIST.id, email: THERAPIST.email, name: THERAPIST.name } },
      prisma,
      headers: new Headers(),
    });

    const result = await caller.appointments.cancel({ appointmentId: 'appt_1', clientUserId: CLIENT_ID });

    expect(result).toEqual({ success: true });
    expect(prisma.appointment.update).toHaveBeenCalledWith({
      where: { id: 'appt_1' },
      data: { cancelled_at: expect.any(Date) },
    });
    expect(prisma.clinicalAccessLog.create).toHaveBeenCalledWith({
      data: { therapist_id: THERAPIST.id, client_user_id: CLIENT_ID, action: 'CANCEL_APPOINTMENT' },
    });
    // The client is told which slot disappeared, not that "an appointment"
    // was cancelled — a bare notice is useless a week later.
    const data = vi.mocked(prisma.notification.create).mock.calls[0]?.[0].data as {
      kind: string;
      body: string;
      appointment_id: string;
    };
    expect(data.kind).toBe('appointment_cancelled');
    expect(data.appointment_id).toBe('appt_1');
    expect(data.body).toBe('Your session on Sun, 20 Sep at 6:00 pm has been cancelled.');
  });
});
