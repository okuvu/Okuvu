import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildApp } from '../app.js';

const ORIGINAL_ENV = { ...process.env };

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    appointment: { findMany: vi.fn() },
  },
}));

async function importMocks() {
  const { prisma } = await import('../lib/prisma.js');
  return prisma;
}

function mockAppointment(overrides?: Partial<Record<string, unknown>>) {
  return {
    id: 'appt-1',
    therapist_id: 'th_1',
    scheduled_at: new Date('2026-09-18T12:30:00Z'),
    duration_minutes: 50,
    mode: 'video',
    location: null,
    note_to_client: 'Bring your journal.',
    remind_24h: false,
    remind_1h: false,
    rescheduled_from: null,
    cancelled_at: null,
    therapist: { name: 'Dr. Rao' },
    ...overrides,
  };
}

describe('GET /users/me/appointments (app wireframes A2)', () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, LOCAL_DEV_BYPASS_AUTH: 'true' };
    app = buildApp();
  });

  afterEach(async () => {
    if (app) await app.close();
    process.env = { ...ORIGINAL_ENV };
    vi.clearAllMocks();
  });

  it('returns 401 when no matching User', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    const response = await app.inject({ method: 'GET', url: '/users/me/appointments' });

    expect(response.statusCode).toBe(401);
  });

  it('splits appointments into upcoming and past', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'user-1' } as never);
    vi.mocked(prisma.appointment.findMany)
      .mockResolvedValueOnce([mockAppointment({ id: 'appt-upcoming' })] as never)
      .mockResolvedValueOnce([
        mockAppointment({ id: 'appt-past', cancelled_at: new Date('2026-08-28T13:00:00Z') }),
      ] as never);

    const response = await app.inject({ method: 'GET', url: '/users/me/appointments' });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.upcoming).toHaveLength(1);
    expect(body.upcoming[0].id).toBe('appt-upcoming');
    expect(body.past).toHaveLength(1);
    expect(body.past[0].id).toBe('appt-past');
  });

  it('maps every field, including therapist name and reschedule provenance', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'user-1' } as never);
    vi.mocked(prisma.appointment.findMany)
      .mockResolvedValueOnce([
        mockAppointment({ rescheduled_from: 'appt-old', remind_24h: true }),
      ] as never)
      .mockResolvedValueOnce([] as never);

    const response = await app.inject({ method: 'GET', url: '/users/me/appointments' });

    expect(response.json().upcoming[0]).toEqual({
      id: 'appt-1',
      scheduledAt: '2026-09-18T12:30:00.000Z',
      durationMinutes: 50,
      mode: 'video',
      location: null,
      noteToClient: 'Bring your journal.',
      remind24h: true,
      remind1h: false,
      rescheduledFrom: 'appt-old',
      cancelledAt: null,
      therapistId: 'th_1',
      therapistName: 'Dr. Rao',
    });
  });

  it('scopes the query to the authenticated user only', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'user-1' } as never);
    vi.mocked(prisma.appointment.findMany).mockResolvedValue([] as never);

    await app.inject({ method: 'GET', url: '/users/me/appointments' });

    expect(prisma.appointment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ client_user_id: 'user-1' }),
      }),
    );
  });

  describe('past pagination', () => {
    it('defaults to a page of 20 and reports pastHasMore false when fewer than 20 rows exist', async () => {
      const prisma = await importMocks();
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'user-1' } as never);
      vi.mocked(prisma.appointment.findMany)
        .mockResolvedValueOnce([] as never)
        .mockResolvedValueOnce([mockAppointment({ id: 'appt-1' })] as never);

      const response = await app.inject({ method: 'GET', url: '/users/me/appointments' });

      expect(response.json().pastHasMore).toBe(false);
      expect(response.json().past).toHaveLength(1);
      expect(prisma.appointment.findMany).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ skip: 0, take: 21 }),
      );
    });

    it('reports pastHasMore true and trims the extra probe row when a full page is returned', async () => {
      const prisma = await importMocks();
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'user-1' } as never);
      const twentyOneRows = Array.from({ length: 21 }, (_, i) => mockAppointment({ id: `appt-${i}` }));
      vi.mocked(prisma.appointment.findMany)
        .mockResolvedValueOnce([] as never)
        .mockResolvedValueOnce(twentyOneRows as never);

      const response = await app.inject({ method: 'GET', url: '/users/me/appointments' });

      expect(response.json().pastHasMore).toBe(true);
      expect(response.json().past).toHaveLength(20);
    });

    it('honors past_limit and past_offset query params', async () => {
      const prisma = await importMocks();
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'user-1' } as never);
      vi.mocked(prisma.appointment.findMany)
        .mockResolvedValueOnce([] as never)
        .mockResolvedValueOnce([] as never);

      await app.inject({ method: 'GET', url: '/users/me/appointments?past_limit=5&past_offset=20' });

      expect(prisma.appointment.findMany).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ skip: 20, take: 6 }),
      );
    });

    it('rejects a past_limit outside 1-50', async () => {
      const response = await app.inject({ method: 'GET', url: '/users/me/appointments?past_limit=51' });
      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('INVALID_PAST_LIMIT');
    });

    it('rejects a negative past_offset', async () => {
      const response = await app.inject({ method: 'GET', url: '/users/me/appointments?past_offset=-1' });
      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('INVALID_PAST_OFFSET');
    });
  });
});
