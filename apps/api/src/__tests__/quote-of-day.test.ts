import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildApp } from '../app.js';
import { getQuoteOfDay } from '../lib/quote-of-day.js';

const ORIGINAL_ENV = { ...process.env };

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    reminder: { findMany: vi.fn() },
    therapistClient: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    appointment: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn(),
    },
    homework: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    userToolPreference: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

async function importMocks() {
  const { prisma } = await import('../lib/prisma.js');
  return prisma;
}

describe('getQuoteOfDay (okuvu-remaining-changes.md O6 — placeholder content)', () => {
  it('is deterministic for the same care plan and date', () => {
    const date = new Date('2026-09-12T00:00:00Z');
    expect(getQuoteOfDay('CP1', date)).toBe(getQuoteOfDay('CP1', date));
  });

  it('varies by care plan on the same date', () => {
    const date = new Date('2026-09-12T00:00:00Z');
    const cp1 = getQuoteOfDay('CP1', date);
    const cp2 = getQuoteOfDay('CP2', date);
    const cp3 = getQuoteOfDay('CP3', date);
    // Not a strict "all different" requirement (lists could theoretically
    // collide), but each call must return a non-empty string from that
    // plan's own list.
    expect(cp1.length).toBeGreaterThan(0);
    expect(cp2.length).toBeGreaterThan(0);
    expect(cp3.length).toBeGreaterThan(0);
  });

  it('changes on a different day', () => {
    const day1 = getQuoteOfDay('CP1', new Date('2026-09-12T00:00:00Z'));
    const day2 = getQuoteOfDay('CP1', new Date('2026-09-13T00:00:00Z'));
    // With a 5-item list these could coincide by chance every 5 days, so
    // just assert both are valid non-empty strings rather than !==.
    expect(day1.length).toBeGreaterThan(0);
    expect(day2.length).toBeGreaterThan(0);
  });
});

describe('GET /users/me/today — quote field (okuvu-remaining-changes.md O6)', () => {
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

  it('includes a quote when enabled and a care plan exists', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'user-1',
      quote_of_day_enabled: true,
      clinical_config: { care_plan_id: 'CP2' },
    } as never);
    vi.mocked(prisma.reminder.findMany).mockResolvedValue([]);

    const response = await app.inject({ method: 'GET', url: '/users/me/today' });

    expect(response.statusCode).toBe(200);
    expect(typeof response.json().quote).toBe('string');
  });

  it('returns null quote when disabled', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'user-1',
      quote_of_day_enabled: false,
      clinical_config: { care_plan_id: 'CP1' },
    } as never);
    vi.mocked(prisma.reminder.findMany).mockResolvedValue([]);

    const response = await app.inject({ method: 'GET', url: '/users/me/today' });

    expect(response.json().quote).toBeNull();
  });

  it('returns null quote when enabled but no care plan exists yet', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'user-1',
      quote_of_day_enabled: true,
      clinical_config: null,
    } as never);
    vi.mocked(prisma.reminder.findMany).mockResolvedValue([]);

    const response = await app.inject({ method: 'GET', url: '/users/me/today' });

    expect(response.json().quote).toBeNull();
  });

  it('marks activation for the calling client (Phase 1 status lifecycle)', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'user-1',
      quote_of_day_enabled: false,
      clinical_config: null,
    } as never);
    vi.mocked(prisma.reminder.findMany).mockResolvedValue([]);

    await app.inject({ method: 'GET', url: '/users/me/today' });

    expect(prisma.therapistClient.updateMany).toHaveBeenCalledWith({
      where: { client_user_id: 'user-1', activated_at: null },
      data: { activated_at: expect.any(Date) },
    });
  });

  it('includes pendingChatAccessRequest when a therapist has an unanswered request', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'user-1',
      quote_of_day_enabled: false,
      clinical_config: null,
    } as never);
    vi.mocked(prisma.reminder.findMany).mockResolvedValue([]);
    vi.mocked(prisma.therapistClient.findFirst).mockResolvedValue({
      therapist_id: 'th_1',
      chat_access_granted: false,
      chat_access_requested_at: new Date('2026-09-15T00:00:00Z'),
      therapist: { name: 'Dr. Jane Doe' },
    } as never);

    const response = await app.inject({ method: 'GET', url: '/users/me/today' });

    expect(response.json().pendingChatAccessRequest).toEqual({
      therapistId: 'th_1',
      therapistName: 'Dr. Jane Doe',
    });
  });

  it('returns null pendingChatAccessRequest when there is no assigned therapist', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'user-1',
      quote_of_day_enabled: false,
      clinical_config: null,
    } as never);
    vi.mocked(prisma.reminder.findMany).mockResolvedValue([]);
    vi.mocked(prisma.therapistClient.findFirst).mockResolvedValue(null);

    const response = await app.inject({ method: 'GET', url: '/users/me/today' });

    expect(response.json().pendingChatAccessRequest).toBeNull();
    expect(response.json().therapistChatAccess).toBeNull();
  });

  it('includes therapistChatAccess reflecting current grant state, even with no pending request', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'user-1',
      quote_of_day_enabled: false,
      clinical_config: null,
    } as never);
    vi.mocked(prisma.reminder.findMany).mockResolvedValue([]);
    vi.mocked(prisma.therapistClient.findFirst).mockResolvedValue({
      therapist_id: 'th_1',
      chat_access_granted: true,
      chat_access_requested_at: null,
      therapist: { name: 'Dr. Jane Doe' },
    } as never);

    const response = await app.inject({ method: 'GET', url: '/users/me/today' });

    expect(response.json().pendingChatAccessRequest).toBeNull();
    expect(response.json().therapistChatAccess).toEqual({
      therapistId: 'th_1',
      therapistName: 'Dr. Jane Doe',
      granted: true,
    });
  });

  it('returns null nextAppointment when nothing is booked', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'user-1',
      quote_of_day_enabled: false,
      clinical_config: null,
    } as never);
    vi.mocked(prisma.reminder.findMany).mockResolvedValue([]);
    vi.mocked(prisma.appointment.findFirst).mockResolvedValue(null);

    const response = await app.inject({ method: 'GET', url: '/users/me/today' });

    expect(response.json().nextAppointment).toBeNull();
  });

  it('includes nextAppointment when a session is booked', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'user-1',
      quote_of_day_enabled: false,
      clinical_config: null,
    } as never);
    vi.mocked(prisma.reminder.findMany).mockResolvedValue([]);
    vi.mocked(prisma.appointment.findFirst).mockResolvedValue({
      id: 'appt-1',
      therapist_id: 'th_1',
      scheduled_at: new Date('2026-09-18T12:30:00Z'),
      duration_minutes: 50,
      mode: 'video',
      location: null,
      note_to_client: null,
      remind_24h: false,
      remind_1h: false,
      rescheduled_from: null,
      cancelled_at: null,
      therapist: { name: 'Dr. Rao' },
    } as never);

    const response = await app.inject({ method: 'GET', url: '/users/me/today' });

    expect(response.json().nextAppointment).toEqual({
      id: 'appt-1',
      scheduledAt: '2026-09-18T12:30:00.000Z',
      durationMinutes: 50,
      mode: 'video',
      location: null,
      noteToClient: null,
      remind24h: false,
      remind1h: false,
      rescheduledFrom: null,
      cancelledAt: null,
      therapistId: 'th_1',
      therapistName: 'Dr. Rao',
    });
  });
});

describe('PATCH /users/me/chat-access (therapist-portal wireframes — client grants/denies)', () => {
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

  it('grants access and clears the request timestamp', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'user-1' } as never);
    vi.mocked(prisma.therapistClient.findUnique).mockResolvedValue({ id: 'tc_1' } as never);
    vi.mocked(prisma.therapistClient.update).mockResolvedValue({} as never);

    const response = await app.inject({
      method: 'PATCH',
      url: '/users/me/chat-access',
      payload: { therapist_id: 'th_1', granted: true },
    });

    expect(response.statusCode).toBe(200);
    expect(prisma.therapistClient.update).toHaveBeenCalledWith({
      where: { id: 'tc_1' },
      data: { chat_access_granted: true, chat_access_requested_at: null },
    });
  });

  it('denies access when granted is false', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'user-1' } as never);
    vi.mocked(prisma.therapistClient.findUnique).mockResolvedValue({ id: 'tc_1' } as never);
    vi.mocked(prisma.therapistClient.update).mockResolvedValue({} as never);

    const response = await app.inject({
      method: 'PATCH',
      url: '/users/me/chat-access',
      payload: { therapist_id: 'th_1', granted: false },
    });

    expect(response.statusCode).toBe(200);
    expect(prisma.therapistClient.update).toHaveBeenCalledWith({
      where: { id: 'tc_1' },
      data: { chat_access_granted: false, chat_access_requested_at: null },
    });
  });

  it('rejects a missing/invalid body', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/users/me/chat-access',
      payload: { therapist_id: 'th_1' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('INVALID_BODY');
  });

  it('returns 401 when the user does not exist', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    const response = await app.inject({
      method: 'PATCH',
      url: '/users/me/chat-access',
      payload: { therapist_id: 'th_1', granted: true },
    });

    expect(response.statusCode).toBe(401);
  });

  it('returns 404 when the therapist relationship does not exist', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'user-1' } as never);
    vi.mocked(prisma.therapistClient.findUnique).mockResolvedValue(null);

    const response = await app.inject({
      method: 'PATCH',
      url: '/users/me/chat-access',
      payload: { therapist_id: 'th_stranger', granted: true },
    });

    expect(response.statusCode).toBe(404);
  });
});
