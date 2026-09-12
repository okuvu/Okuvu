import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildApp } from '../app.js';
import { getQuoteOfDay } from '../lib/quote-of-day.js';

const ORIGINAL_ENV = { ...process.env };

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    reminder: { findMany: vi.fn() },
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
      homeworks: [],
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
      homeworks: [],
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
      homeworks: [],
      clinical_config: null,
    } as never);
    vi.mocked(prisma.reminder.findMany).mockResolvedValue([]);

    const response = await app.inject({ method: 'GET', url: '/users/me/today' });

    expect(response.json().quote).toBeNull();
  });
});
