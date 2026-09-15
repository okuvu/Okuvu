import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildApp } from '../app.js';

const ORIGINAL_ENV = { ...process.env };

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    clinicalConfig: { update: vi.fn() },
  },
}));

async function importMocks() {
  const { prisma } = await import('../lib/prisma.js');
  return prisma;
}

describe('GET /users/me/welcome (therapist-portal wireframes C-04/C-06)', () => {
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

  it('returns the welcome note and abbreviation when set', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      clinical_config: { welcome_note: 'Looking forward to working with you.', display_abbreviation: 'S.' },
    } as never);

    const response = await app.inject({ method: 'GET', url: '/users/me/welcome' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      welcomeNote: 'Looking forward to working with you.',
      displayAbbreviation: 'S.',
    });
  });

  it('returns nulls when there is no clinical config yet', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ clinical_config: null } as never);

    const response = await app.inject({ method: 'GET', url: '/users/me/welcome' });

    expect(response.json()).toEqual({ welcomeNote: null, displayAbbreviation: null });
  });

  it('returns 401 when the user does not exist', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    const response = await app.inject({ method: 'GET', url: '/users/me/welcome' });

    expect(response.statusCode).toBe(401);
  });
});

describe('PATCH /users/me/welcome', () => {
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

  it('updates display_abbreviation', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'user-1',
      clinical_config: { id: 'cc_1' },
    } as never);
    vi.mocked(prisma.clinicalConfig.update).mockResolvedValue({} as never);

    const response = await app.inject({
      method: 'PATCH',
      url: '/users/me/welcome',
      payload: { display_abbreviation: 'Shub.' },
    });

    expect(response.statusCode).toBe(200);
    expect(prisma.clinicalConfig.update).toHaveBeenCalledWith({
      where: { user_id: 'user-1' },
      data: { display_abbreviation: 'Shub.' },
    });
  });

  it('rejects an empty abbreviation', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/users/me/welcome',
      payload: { display_abbreviation: '   ' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('INVALID_BODY');
  });

  it('returns 404 when there is no care plan yet', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'user-1', clinical_config: null } as never);

    const response = await app.inject({
      method: 'PATCH',
      url: '/users/me/welcome',
      payload: { display_abbreviation: 'S.' },
    });

    expect(response.statusCode).toBe(404);
  });

  it('returns 401 when the user does not exist', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    const response = await app.inject({
      method: 'PATCH',
      url: '/users/me/welcome',
      payload: { display_abbreviation: 'S.' },
    });

    expect(response.statusCode).toBe(401);
  });
});
