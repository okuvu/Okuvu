import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildApp } from '../app.js';

const ORIGINAL_ENV = { ...process.env };

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
    moodLog: {
      findMany: vi.fn(),
    },
  },
}));

const MOCK_USER_ID = '550e8400-e29b-41d4-a716-446655440000';

async function importMocks() {
  const { prisma } = await import('../lib/prisma.js');
  return prisma;
}

/**
 * The weekly mood summary.
 *
 * The owner's instruction: in words, for the client, no score. So this route is
 * asserted on both halves — it reads the week back in the client's own words,
 * and it never sends a number that could be read as a result.
 */
describe('GET /progress/mood/week', () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, LOCAL_DEV_BYPASS_AUTH: 'true' };
  });

  afterEach(async () => {
    if (app) await app.close();
    process.env = { ...ORIGINAL_ENV };
    vi.clearAllMocks();
  });

  it('writes the week back in the client\'s own words', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: MOCK_USER_ID } as never);
    vi.mocked(prisma.moodLog.findMany).mockResolvedValue([
      {
        id: 'a',
        date_ist: new Date('2026-11-20T00:00:00.000Z'),
        mood_value: 2,
        feeling_words: ['tired', 'sad'],
        feeling_other: null,
        strength_1_5: 3,
        shared_with_therapist: false,
      },
      {
        id: 'b',
        date_ist: new Date('2026-11-21T00:00:00.000Z'),
        mood_value: 4,
        feeling_words: ['tired'],
        feeling_other: null,
        strength_1_5: null,
        shared_with_therapist: true,
      },
    ] as never[]);
    app = buildApp();

    const response = await app.inject({ method: 'GET', url: '/progress/mood/week' });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.recordedDays).toBe(2);
    expect(body.windowDays).toBe(7);
    expect(body.days).toEqual([
      { date: '2026-11-20', moodLabel: 'Low', feelingWords: ['tired', 'sad'] },
      { date: '2026-11-21', moodLabel: 'Good', feelingWords: ['tired'] },
    ]);
    expect(body.repeatedFeelings).toEqual(['tired']);
    expect(body.sentences).toContain('You checked in on 2 of the last 7 days.');
    expect(body.sentences).toContain('The week opened at Low and closed at Good.');
  });

  it('never sends a score, an average, a level or a chart series', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: MOCK_USER_ID } as never);
    vi.mocked(prisma.moodLog.findMany).mockResolvedValue([
      {
        id: 'a',
        date_ist: new Date('2026-11-20T00:00:00.000Z'),
        mood_value: 1,
        feeling_words: ['numb'],
        feeling_other: null,
        strength_1_5: 5,
        shared_with_therapist: false,
      },
      {
        id: 'b',
        date_ist: new Date('2026-11-22T00:00:00.000Z'),
        mood_value: 5,
        feeling_words: ['numb'],
        feeling_other: null,
        strength_1_5: 1,
        shared_with_therapist: false,
      },
    ] as never[]);
    app = buildApp();

    const response = await app.inject({ method: 'GET', url: '/progress/mood/week' });
    const text = JSON.stringify(response.json()).toLowerCase();

    for (const banned of ['average', 'score', 'level', 'out of', 'rating', 'trend']) {
      expect(text, banned).not.toContain(banned);
    }
    // The stored 1-5 values and the 1-5 strength are never rendered as results.
    const body = response.json();
    expect(body).not.toHaveProperty('average');
    expect(body).not.toHaveProperty('score');
    expect(body).not.toHaveProperty('series');
    expect(body.days.every((d: { moodLabel: string }) => typeof d.moodLabel === 'string')).toBe(true);
  });

  it('names the empty week rather than returning an empty screen', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: MOCK_USER_ID } as never);
    vi.mocked(prisma.moodLog.findMany).mockResolvedValue([] as never[]);
    app = buildApp();

    const response = await app.inject({ method: 'GET', url: '/progress/mood/week' });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.recordedDays).toBe(0);
    expect(body.sentences).toHaveLength(1);
    expect(body.sentences[0]).toContain('No check-ins in the last 7 days yet.');
  });

  it('drops a stored value with no face rather than inventing a word', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: MOCK_USER_ID } as never);
    vi.mocked(prisma.moodLog.findMany).mockResolvedValue([
      {
        id: 'a',
        date_ist: new Date('2026-11-20T00:00:00.000Z'),
        mood_value: 3,
        feeling_words: [],
        feeling_other: null,
        strength_1_5: null,
        shared_with_therapist: false,
      },
      {
        // Outside 1-5: no face, so no word. It must not become "Unknown".
        id: 'b',
        date_ist: new Date('2026-11-21T00:00:00.000Z'),
        mood_value: 9,
        feeling_words: [],
        feeling_other: null,
        strength_1_5: null,
        shared_with_therapist: false,
      },
    ] as never[]);
    app = buildApp();

    const response = await app.inject({ method: 'GET', url: '/progress/mood/week' });
    const body = response.json();

    expect(body.recordedDays).toBe(1);
    expect(body.days).toHaveLength(1);
  });

  it('401s when the caller has no user record', async () => {
    const prisma = await importMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    app = buildApp();

    const response = await app.inject({ method: 'GET', url: '/progress/mood/week' });

    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('UNAUTHORIZED');
  });
});
