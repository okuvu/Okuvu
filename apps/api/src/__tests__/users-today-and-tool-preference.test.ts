import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildApp } from '../app.js';

const ORIGINAL_ENV = { ...process.env };

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
    therapistClient: {
      updateMany: vi.fn(),
      findFirst: vi.fn(),
    },
    appointment: {
      findFirst: vi.fn(),
    },
    reminder: {
      findMany: vi.fn(),
    },
    homework: {
      findMany: vi.fn(),
    },
    userToolPreference: {
      findMany: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

const MOCK_USER_ID = '550e8400-e29b-41d4-a716-446655440000';

async function importMocks() {
  const { prisma } = await import('../lib/prisma.js');
  return prisma;
}

function baseUserRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: MOCK_USER_ID,
    quote_of_day_enabled: false,
    homeworks: [],
    clinical_config: null,
    ...overrides,
  };
}

describe('GET /users/me/today — assignedExercises + defaultBoxBreathingPacePreset', () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, LOCAL_DEV_BYPASS_AUTH: 'true' };
  });

  afterEach(async () => {
    if (app) await app.close();
    process.env = { ...ORIGINAL_ENV };
    vi.clearAllMocks();
  });

  it('returns empty assignedExercises and standard default pace when nothing is set', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue(baseUserRow() as any);
    vi.mocked(prisma.therapistClient.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.appointment.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.reminder.findMany).mockResolvedValue([]);
    vi.mocked(prisma.homework.findMany).mockResolvedValue([]);
    vi.mocked(prisma.userToolPreference.findMany).mockResolvedValue([]);
    app = buildApp();

    const response = await app.inject({ method: 'GET', url: '/users/me/today' });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.assignedExercises).toEqual([]);
    expect(body.defaultBoxBreathingPacePreset).toBe('standard');
  });

  it('maps active tool-linked homework to assignedExercises, with per-exercise pace', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue(baseUserRow() as any);
    vi.mocked(prisma.therapistClient.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.appointment.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.reminder.findMany).mockResolvedValue([]);
    vi.mocked(prisma.homework.findMany).mockResolvedValue([
      {
        tool: {
          tool_id: 'physiological_sigh',
          label: 'Physiological Sigh',
          text: 'Physiological sigh — two quick breaths in, one long breath out.',
        },
      },
    ] as any);
    vi.mocked(prisma.userToolPreference.findMany).mockResolvedValue([
      { tool_id: 'physiological_sigh', pace_preset: 'faster' },
      { tool_id: 'box_breathing', pace_preset: 'slower' },
    ] as any);
    app = buildApp();

    const response = await app.inject({ method: 'GET', url: '/users/me/today' });

    const body = response.json();
    expect(body.assignedExercises).toEqual([
      {
        toolId: 'physiological_sigh',
        label: 'Physiological Sigh',
        text: 'Physiological sigh — two quick breaths in, one long breath out.',
        pacePreset: 'faster',
      },
    ]);
    expect(body.defaultBoxBreathingPacePreset).toBe('slower');
  });

  it('filters the homework query to active rows with a non-null tool_id', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue(baseUserRow() as any);
    vi.mocked(prisma.therapistClient.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.appointment.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.reminder.findMany).mockResolvedValue([]);
    vi.mocked(prisma.homework.findMany).mockResolvedValue([]);
    vi.mocked(prisma.userToolPreference.findMany).mockResolvedValue([]);
    app = buildApp();

    await app.inject({ method: 'GET', url: '/users/me/today' });

    expect(prisma.homework.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { client_user_id: MOCK_USER_ID, status: 'active', tool_id: { not: null } },
      }),
    );
  });

  it('returns 401 when firebase_uid has no User row', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    app = buildApp();

    const response = await app.inject({ method: 'GET', url: '/users/me/today' });

    expect(response.statusCode).toBe(401);
  });

  it('returns careEnded: false when there is an active (non-ended) relationship', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue(baseUserRow() as any);
    vi.mocked(prisma.therapistClient.findFirst).mockResolvedValue({
      therapist_id: 'th_1',
      chat_access_granted: false,
      chat_access_requested_at: null,
      therapist: { name: 'Dr. Rao' },
    } as any);
    vi.mocked(prisma.appointment.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.reminder.findMany).mockResolvedValue([]);
    vi.mocked(prisma.homework.findMany).mockResolvedValue([]);
    vi.mocked(prisma.userToolPreference.findMany).mockResolvedValue([]);
    app = buildApp();

    const response = await app.inject({ method: 'GET', url: '/users/me/today' });

    const body = response.json();
    expect(body.careEnded).toBe(false);
    expect(body.careEndedByTherapistName).toBeNull();
    // The ended-relationship lookup is skipped entirely when there's an
    // active one — only the one findFirst call (for therapistRelationship)
    // should have happened.
    expect(prisma.therapistClient.findFirst).toHaveBeenCalledTimes(1);
  });

  it('returns careEnded: true with the ending therapist\'s name when the only relationship is ended', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue(baseUserRow() as any);
    vi.mocked(prisma.therapistClient.findFirst).mockImplementation((async (args: any) => {
      if (args?.where?.ended_at === null) return null;
      return { therapist: { name: 'Dr. Rao' } };
    }) as any);
    vi.mocked(prisma.appointment.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.reminder.findMany).mockResolvedValue([]);
    vi.mocked(prisma.homework.findMany).mockResolvedValue([]);
    vi.mocked(prisma.userToolPreference.findMany).mockResolvedValue([]);
    app = buildApp();

    const response = await app.inject({ method: 'GET', url: '/users/me/today' });

    const body = response.json();
    expect(body.careEnded).toBe(true);
    expect(body.careEndedByTherapistName).toBe('Dr. Rao');
  });
});

describe('PATCH /users/me/tool-preference', () => {
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

  it('upserts a UserToolPreference row for a valid preset', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: MOCK_USER_ID } as any);
    vi.mocked(prisma.userToolPreference.upsert).mockResolvedValue({} as any);

    const response = await app.inject({
      method: 'PATCH',
      url: '/users/me/tool-preference',
      payload: { tool_id: 'box_breathing', pace_preset: 'faster' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ success: true });
    expect(prisma.userToolPreference.upsert).toHaveBeenCalledWith({
      where: { user_id_tool_id: { user_id: MOCK_USER_ID, tool_id: 'box_breathing' } },
      create: { user_id: MOCK_USER_ID, tool_id: 'box_breathing', pace_preset: 'faster' },
      update: { pace_preset: 'faster' },
    });
  });

  it.each(['slow', 'fastest', '', 'STANDARD'])('rejects an invalid pace_preset value: %s', async (pace) => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/users/me/tool-preference',
      payload: { tool_id: 'box_breathing', pace_preset: pace },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('INVALID_BODY');
  });

  it('rejects a missing tool_id', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/users/me/tool-preference',
      payload: { pace_preset: 'standard' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('INVALID_BODY');
  });

  it('returns 401 when firebase_uid has no User row', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    const response = await app.inject({
      method: 'PATCH',
      url: '/users/me/tool-preference',
      payload: { tool_id: 'box_breathing', pace_preset: 'standard' },
    });

    expect(response.statusCode).toBe(401);
  });

  describe('auth — bypass disabled', () => {
    it('returns 401 when no Authorization header', async () => {
      delete process.env.LOCAL_DEV_BYPASS_AUTH;
      const bypassApp = buildApp();

      const response = await bypassApp.inject({
        method: 'PATCH',
        url: '/users/me/tool-preference',
        payload: { tool_id: 'box_breathing', pace_preset: 'standard' },
      });

      expect(response.statusCode).toBe(401);
      await bypassApp.close();
    });
  });
});
