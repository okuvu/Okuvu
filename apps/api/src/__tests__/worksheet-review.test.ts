/**
 * GET /worksheets/:toolId/review — the weekly read-back, in words.
 *
 * The owner asked for "a simple weekly view in words showing which activities
 * came with better feelings, with no score" (24 Nov 2026). These tests are about
 * the three properties that make that safe and honest:
 *
 *   1. it is the client's own words and their own feeling labels, grouped — no
 *      total, no average, no ranking of feelings, no score of any kind;
 *   2. it only ever reads this client's rows for this worksheet;
 *   3. nothing unreachable can be asked: a draft, a therapist-only row, a
 *      worksheet that declares no review, or an unassigned one all answer
 *      exactly as an unknown id does.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { entryById } from '@okuvu/shared-types/worksheets';
import type { CatalogueEntry } from '@okuvu/shared-types/worksheets';
import { buildApp } from '../app.js';

const ORIGINAL_ENV = { ...process.env };

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    toolRegistryEntry: { findUnique: vi.fn() },
    worksheetResponse: { findMany: vi.fn() },
    homework: { findFirst: vi.fn() },
  },
}));

vi.mock('../lib/email.js', () => ({
  sendSafetyAlertEmail: vi.fn().mockResolvedValue(undefined),
}));

const MOCK_USER_ID = '550e8400-e29b-41d4-a716-446655440000';
const TOOL_ID = 'ws_mood_activity_log';

function rowFor(toolId: string, overrides: Record<string, unknown> = {}) {
  const entry = entryById(toolId) as CatalogueEntry;
  return {
    tool_id: entry.tool_id,
    kind: 'worksheet',
    status: entry.status,
    label: entry.label,
    summary: entry.summary,
    section: entry.section,
    access_mode: entry.access_mode,
    load_level: entry.load_level,
    est_minutes: entry.est_minutes,
    library_group: entry.library_group ?? null,
    content_en: entry.content_en,
    content_hi: entry.content_hi,
    therapy_modality: entry.therapy_modality,
    therapist_note: entry.therapist_note,
    care_plans: entry.care_plans,
    sensitive_check: entry.sensitive_check,
    ...overrides,
  };
}

function response(answers: Record<string, unknown>, at: string) {
  return { answers, completed_at: new Date(at) };
}

describe('GET /worksheets/:toolId/review', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    process.env = { ...ORIGINAL_ENV, LOCAL_DEV_BYPASS_AUTH: 'true' };
    vi.clearAllMocks();
    const { prisma } = await import('../lib/prisma.js');
    const p = prisma as unknown as Record<string, any>;
    p.user.findUnique.mockResolvedValue({ id: MOCK_USER_ID });
    // The route serves approved rows only. The Low Mood batch is still a draft,
    // so the fixture presents this row as approved to exercise the view itself;
    // the draft case has its own test below.
    p.toolRegistryEntry.findUnique.mockResolvedValue(rowFor(TOOL_ID, { status: 'approved' }));
    p.worksheetResponse.findMany.mockResolvedValue([]);
    p.homework.findFirst.mockResolvedValue({ id: 'hw-1' });
    app = await buildApp();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  const get = (toolId = TOOL_ID) =>
    app.inject({ method: 'GET', url: `/worksheets/${toolId}/review` });

  it('groups the entries by the activity words the client wrote, with their feelings', async () => {
    const { prisma } = await import('../lib/prisma.js');
    const p = prisma as unknown as Record<string, any>;
    p.worksheetResponse.findMany.mockResolvedValue([
      response({ doing: 'Chai with a friend', feelings: { picked: ['calm', 'happy'] } }, '2026-11-24T10:00:00Z'),
      response({ doing: 'Scrolling in bed', feelings: { picked: ['numb'] } }, '2026-11-23T23:00:00Z'),
      response({ doing: 'Chai with a friend', feelings: { picked: ['calm'] } }, '2026-11-22T10:00:00Z'),
    ]);

    const result = await get();
    expect(result.statusCode).toBe(200);
    const body = result.json();

    expect(body.available).toBe(true);
    expect(body.withinDays).toBe(7);
    expect(body.groups).toHaveLength(2);

    // Newest activity first, and the heading is the client's own spelling.
    expect(body.groups[0].activity).toBe('Chai with a friend');
    expect(body.groups[0].entries).toHaveLength(2);
    // Feeling ids resolved to the labels the client actually saw.
    expect(body.groups[0].entries[0].feelings).toEqual(['calm', 'happy']);
    expect(body.groups[1].activity).toBe('Scrolling in bed');

    // Only this client's rows, only this worksheet's.
    expect(p.worksheetResponse.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ user_id: MOCK_USER_ID, worksheet_id: TOOL_ID }),
      }),
    );
  });

  it('carries no score, total, average or rank anywhere in the response', async () => {
    const { prisma } = await import('../lib/prisma.js');
    const p = prisma as unknown as Record<string, any>;
    p.worksheetResponse.findMany.mockResolvedValue([
      response({ doing: 'A walk', feelings: { picked: ['calm'] } }, '2026-11-24T10:00:00Z'),
    ]);

    const body = (await get()).json();
    const serialised = JSON.stringify(body);

    // The only number is the window and the count of entries returned; nothing
    // scores the client or ranks one activity above another.
    expect(serialised).not.toMatch(/average|score|level|rating|best|worst|rank/i);
    expect(Object.keys(body).sort()).toEqual(['available', 'groups', 'totalEntries', 'withinDays']);
    expect(Object.keys(body.groups[0]).sort()).toEqual(['activity', 'entries']);
    expect(Object.keys(body.groups[0].entries[0]).sort()).toEqual(['at', 'feelings']);
  });

  it('skips an entry with no activity words rather than grouping it under nothing', async () => {
    const { prisma } = await import('../lib/prisma.js');
    const p = prisma as unknown as Record<string, any>;
    p.worksheetResponse.findMany.mockResolvedValue([
      response({ doing: '   ', feelings: { picked: ['calm'] } }, '2026-11-24T10:00:00Z'),
      response({ feelings: { picked: ['calm'] } }, '2026-11-24T09:00:00Z'),
      response({ doing: 'A walk', feelings: { picked: ['calm'] } }, '2026-11-23T10:00:00Z'),
    ]);

    const body = (await get()).json();
    expect(body.groups).toHaveLength(1);
    expect(body.groups[0].activity).toBe('A walk');
  });

  it('groups the same words spelled with different case, showing the client’s own spelling', async () => {
    const { prisma } = await import('../lib/prisma.js');
    const p = prisma as unknown as Record<string, any>;
    p.worksheetResponse.findMany.mockResolvedValue([
      response({ doing: 'Chai with a friend', feelings: { picked: ['calm'] } }, '2026-11-24T10:00:00Z'),
      response({ doing: 'chai with a friend', feelings: { picked: ['happy'] } }, '2026-11-22T10:00:00Z'),
    ]);

    const body = (await get()).json();
    expect(body.groups).toHaveLength(1);
    // The heading is the most recent spelling, not a tidied one.
    expect(body.groups[0].activity).toBe('Chai with a friend');
    expect(body.groups[0].entries).toHaveLength(2);
  });

  it('answers 404 for a worksheet that declares no review', async () => {
    const { prisma } = await import('../lib/prisma.js');
    const p = prisma as unknown as Record<string, any>;
    p.toolRegistryEntry.findUnique.mockResolvedValue(
      rowFor('ws_one_small_thing', { status: 'approved' }),
    );

    const result = await get('ws_one_small_thing');
    expect(result.statusCode).toBe(404);
    expect(result.json().error.code).toBe('NOT_FOUND');
  });

  it('answers 404 for a draft, exactly as an unknown id does', async () => {
    const { prisma } = await import('../lib/prisma.js');
    const p = prisma as unknown as Record<string, any>;
    // The Comparison check is a draft in this batch: written, not approved.
    p.toolRegistryEntry.findUnique.mockResolvedValue(rowFor('ws_comparison_check'));

    const draft = await get('ws_comparison_check');
    p.toolRegistryEntry.findUnique.mockResolvedValue(null);
    const unknown = await get('ws_does_not_exist');

    expect(draft.statusCode).toBe(404);
    expect(draft.json()).toEqual(unknown.json());
  });

  it('answers 404 for the therapist-only exposure ladder', async () => {
    const { prisma } = await import('../lib/prisma.js');
    const p = prisma as unknown as Record<string, any>;
    p.toolRegistryEntry.findUnique.mockResolvedValue(
      rowFor('ws_exposure_ladder', { status: 'approved' }),
    );

    const result = await get('ws_exposure_ladder');
    expect(result.statusCode).toBe(404);
  });

  it('refuses an assigned worksheet with no assignment and no entries', async () => {
    const { prisma } = await import('../lib/prisma.js');
    const p = prisma as unknown as Record<string, any>;
    p.toolRegistryEntry.findUnique.mockResolvedValue(
      rowFor('ws_weekly_load_check', { status: 'approved' }),
    );
    p.worksheetResponse.findMany.mockResolvedValue([]);
    p.homework.findFirst.mockResolvedValue(null);

    const result = await get('ws_weekly_load_check');
    expect(result.statusCode).toBe(404);
  });

  it('refuses a body that fails its own rules, rather than half-reading it', async () => {
    const { prisma } = await import('../lib/prisma.js');
    const p = prisma as unknown as Record<string, any>;
    p.toolRegistryEntry.findUnique.mockResolvedValue(
      rowFor(TOOL_ID, {
        status: 'approved',
        content_en: {
          version: 1,
          fields: [{ id: 'doing', type: 'short_text', prompt: 'What?' }],
          review: { withinDays: 7, activityField: 'missing_field', feelingsField: 'feelings' },
        },
      }),
    );

    const result = await get();
    expect(result.statusCode).toBe(404);
  });
});
